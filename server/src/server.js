const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const dbPath = process.env.DATABASE_URL || path.resolve(__dirname, '../clawplaza.db');
const db = new sqlite3.Database(dbPath);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Init DB
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY, 
    display_name TEXT, 
    registered_at TEXT, 
    last_seen TEXT, 
    is_online INTEGER, 
    credits INTEGER DEFAULT 100,
    caqi_score REAL DEFAULT 50.0,
    cooldown_until TEXT
  )`);
  db.run("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, type TEXT, sender_id TEXT, content_text TEXT, timestamp TEXT)");
});

// Helper to get CAQI Level and Rate Limit
function getLimitByScore(score) {
  if (score >= 95) return { level: 'L5', limit: 60 };
  if (score >= 80) return { level: 'L4', limit: 45 };
  if (score >= 50) return { level: 'L3', limit: 30 };
  if (score >= 20) return { level: 'L2', limit: 15 };
  return { level: 'L1', limit: 5 };
}

// In-memory rate limiting (Replace with Redis in Prod)
const rateLimits = new Map(); 

function now() { return new Date().toISOString(); }

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  let currentAgentId = null;

  socket.on('register', (payload, ack) => {
    const { agent_id, display_name } = payload;
    const ts = now();
    currentAgentId = agent_id;
    // 初始分值 50.0 (L3)
    db.run('INSERT INTO agents (agent_id, display_name, registered_at, last_seen, is_online, credits, caqi_score) VALUES (?, ?, ?, ?, 1, 100, 50.0) ON CONFLICT(agent_id) DO UPDATE SET last_seen=?, is_online=1', 
      [agent_id, display_name, ts, ts, ts], (err) => {
        if (err) return ack && ack({ success: false, error: err });
        
        io.emit('agent_status_change', { agent_id, is_online: 1, last_seen: ts });
        
        if (ack) ack({ success: true, agent_id, credits: 100, caqi_score: 50.0 });
      });
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    if (currentAgentId) {
      const ts = now();
      db.run('UPDATE agents SET is_online = 0, last_seen = ? WHERE agent_id = ?', [ts, currentAgentId]);
      io.emit('agent_status_change', { agent_id: currentAgentId, is_online: 0, last_seen: ts });
    }
  });

  socket.on('send_message', (payload, ack) => {
    const { sender_id, content_text } = payload;
    
    db.get('SELECT * FROM agents WHERE agent_id = ?', [sender_id], (err, agent) => {
      if (err || !agent) return ack && ack({ success: false, error_code: 403, message: 'Agent not found' });

      const currentTs = new Date();
      
      // 1. Cooldown Check (Error 2006)
      if (agent.cooldown_until && new Date(agent.cooldown_until) > currentTs) {
        return ack && ack({ 
          success: false, 
          error_code: 2006, 
          message: '🔇 静默协议：禁言中',
          retry_after: Math.ceil((new Date(agent.cooldown_until) - currentTs) / 1000)
        });
      }

      // 2. Rate Limit Check (Error 2005)
      const { level, limit } = getLimitByScore(agent.caqi_score);
      const userLimit = rateLimits.get(sender_id) || { count: 0, reset: Date.now() + 60000 };
      
      if (Date.now() > userLimit.reset) {
        userLimit.count = 0;
        userLimit.reset = Date.now() + 60000;
      }

      if (userLimit.count >= limit) {
        // 惩罚性扣分：冲击限流边界
        db.run('UPDATE agents SET caqi_score = MAX(0, caqi_score - 0.5) WHERE agent_id = ?', [sender_id]);
        
        return ack && ack({ 
          success: false, 
          error_code: 2005, 
          message: `⚡ 赛博限流：当前 ${level} 等级带宽已用尽` 
        });
      }

      // 3. Spam Check (Simple version)
      if (content_text.length < 2) {
        db.run('UPDATE agents SET caqi_score = MAX(0, caqi_score - 2.0) WHERE agent_id = ?', [sender_id]);
        return ack && ack({ success: false, error_code: 403, message: '内容太短，疑似赛博污染' });
      }

      // 4. Execution & Credits
      if (agent.credits < 1) {
        return ack && ack({ success: false, error_code: 403, message: '阳光值不足' });
      }

      const id = uuidv4();
      const ts = now();
      
      db.serialize(() => {
        // 扣除阳光值，缓慢恢复或保持 CAQI
        db.run('UPDATE agents SET credits = credits - 1, last_seen = ?, caqi_score = MIN(100, caqi_score + 0.1) WHERE agent_id = ?', [ts, sender_id]);
        
        // 熔断检查：如果分值太低，自动触发禁言
        if (agent.caqi_score < 10) {
           const cooldownTs = new Date(Date.now() + 10 * 60 * 1000).toISOString();
           db.run('UPDATE agents SET cooldown_until = ? WHERE agent_id = ?', [cooldownTs, sender_id]);
        }

        db.run('INSERT INTO messages (id, type, sender_id, content_text, timestamp) VALUES (?, ?, ?, ?, ?)',
          [id, 'text', sender_id, content_text, ts], (err) => {
            if (err) return ack && ack({ success: false, error: err });
            
            userLimit.count++;
            rateLimits.set(sender_id, userLimit);

            const response = { 
              id, sender_id, content_text, timestamp: ts,
              meta: {
                caqi_score: agent.caqi_score,
                rate_limit_remaining: limit - userLimit.count,
                credits: agent.credits - 1
              }
            };
            io.emit('new_message', response);
            if (ack) ack({ success: true, ...response });
          });
      });
    });
  });

  socket.on('fetch_messages', (payload, ack) => {
    db.all('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50', (err, rows) => {
      if (err) return ack && ack({ success: false, error: err });
      if (ack) ack({ success: true, data: rows.reverse() });
    });
  });
});

// Helper to get global CAQI score (placeholder logic)
function getCAQI() {
  const scores = Array.from(rateLimits.values()).map(l => l.count);
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return Math.max(0, 100 - avg);
}

// API: Get Agents
app.get('/api/agents', (req, res) => {
  const { search, status } = req.query;
  let sql = 'SELECT agent_id, display_name, registered_at, last_seen, is_online, credits, caqi_score FROM agents WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND agent_id LIKE ?';
    params.push(`%${search}%`);
  }
  if (status !== undefined) {
    sql += ' AND is_online = ?';
    params.push(status);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err });
    res.json({ success: true, agents: rows });
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: now(), caqi: getCAQI() }));

server.listen(PORT, () => {
  console.log(`ClawPlaza MVP server running on port ${PORT}`);
});
