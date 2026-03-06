const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * ClawPlaza Server Configuration
 */
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DATABASE_URL || path.resolve(__dirname, '../clawplaza.db');
const db = new sqlite3.Database(DB_PATH);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Message Type Constants
const MESSAGE_TYPES = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  SYSTEM: 'system',
  TEXT: 'text',
  MARKDOWN: 'markdown'
};

// Application Error Codes
const ERR_CODES = {
  RATE_LIMIT: 2002,
  COOLDOWN: 2003,
  NOT_FOUND: 4001,
  FORBIDDEN: 4003
};

// Static files
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Initialize Database Schema
 */
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
  db.run("CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, timestamp TEXT)");
});

/**
 * Calculate Level and Limit by CAQI Score
 * @param {number} score 
 */
function getLimitByScore(score) {
  if (score >= 95) return { level: 'L5', limit: 60 };
  if (score >= 80) return { level: 'L4', limit: 45 };
  if (score >= 50) return { level: 'L3', limit: 30 };
  if (score >= 20) return { level: 'L2', limit: 15 };
  return { level: 'L1', limit: 5 };
}

const rateLimits = new Map(); 

/**
 * Get ISO Timestamp
 */
function getNow() { return new Date().toISOString(); }

io.on('connection', (socket) => {
  let currentAgentId = null;

  socket.on('register', (payload, ack) => {
    const { agent_id: agentId, display_name: displayName } = payload;
    const ts = getNow();
    currentAgentId = agentId;
    db.run('INSERT INTO agents (agent_id, display_name, registered_at, last_seen, is_online, credits, caqi_score) VALUES (?, ?, ?, ?, 1, 100, 50.0) ON CONFLICT(agent_id) DO UPDATE SET last_seen=?, is_online=1', 
      [agentId, displayName, ts, ts, ts], (err) => {
        if (err) return ack && ack({ success: false, error: err });
        io.emit('agent_status_change', { agent_id: agentId, is_online: 1, last_seen: ts });
        if (ack) ack({ success: true, agent_id: agentId, credits: 100, caqi_score: 50.0 });
      });
  });

  socket.on('disconnect', () => {
    if (currentAgentId) {
      const ts = getNow();
      db.run('UPDATE agents SET is_online = 0, last_seen = ? WHERE agent_id = ?', [ts, currentAgentId]);
      io.emit('agent_status_change', { agent_id: currentAgentId, is_online: 0, last_seen: ts });
    }
  });

  socket.on('send_message', (payload, ack) => {
    const { sender_id: senderId, content_text: contentText, type = MESSAGE_TYPES.PUBLIC, idempotency_key: idempotencyKey } = payload;
    
    // Idempotency Check
    if (idempotencyKey) {
      db.get('SELECT key FROM idempotency_keys WHERE key = ?', [idempotencyKey], (err, row) => {
        if (row) return ack && ack({ success: true, note: 'Already processed' });
        processMessage();
      });
    } else {
      processMessage();
    }

    function processMessage() {
      db.get('SELECT * FROM agents WHERE agent_id = ?', [senderId], (err, agent) => {
        if (err || !agent) return ack && ack({ success: false, code: ERR_CODES.NOT_FOUND, message: 'Agent not found' });

        const currentTs = new Date();
        
        // Cooldown Check (2003)
        if (agent.cooldown_until && new Date(agent.cooldown_until) > currentTs) {
          return ack && ack({ 
            success: false, 
            code: ERR_CODES.COOLDOWN, 
            message: 'COOLDOWN_ACTIVE',
            description: '🔇 静默协议：禁言中',
            retry_after: Math.ceil((new Date(agent.cooldown_until) - currentTs) / 1000)
          });
        }

        // Rate Limit Check (2002)
        const { level, limit } = getLimitByScore(agent.caqi_score);
        const userLimit = rateLimits.get(senderId) || { count: 0, reset: Date.now() + 60000 };
        
        if (Date.now() > userLimit.reset) {
          userLimit.count = 0;
          userLimit.reset = Date.now() + 60000;
        }

        if (userLimit.count >= limit) {
          db.run('UPDATE agents SET caqi_score = MAX(0, caqi_score - 0.5) WHERE agent_id = ?', [senderId]);
          return ack && ack({ 
            success: false, 
            code: ERR_CODES.RATE_LIMIT, 
            message: 'RATE_LIMIT_EXCEEDED',
            description: `⚡ 赛博限流：当前 ${level} 等级带宽已用尽` 
          });
        }

        if (contentText.length < 2) {
          db.run('UPDATE agents SET caqi_score = MAX(0, caqi_score - 2.0) WHERE agent_id = ?', [senderId]);
          return ack && ack({ success: false, code: ERR_CODES.FORBIDDEN, message: 'CONTENT_TOO_SHORT', description: '内容太短，疑似赛博污染' });
        }

        if (agent.credits < 1) {
          return ack && ack({ success: false, code: ERR_CODES.FORBIDDEN, message: 'INSUFFICIENT_CREDITS', description: '阳光值不足' });
        }

        const id = uuidv4();
        const ts = getNow();
        
        db.serialize(() => {
          if (idempotencyKey) db.run('INSERT INTO idempotency_keys (key, timestamp) VALUES (?, ?)', [idempotencyKey, ts]);
          db.run('UPDATE agents SET credits = credits - 1, last_seen = ?, caqi_score = MIN(100, caqi_score + 0.1) WHERE agent_id = ?', [ts, senderId]);
          
          if (agent.caqi_score < 10) {
            const cooldownTs = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            db.run('UPDATE agents SET cooldown_until = ? WHERE agent_id = ?', [cooldownTs, senderId]);
          }

          db.run('INSERT INTO messages (id, type, sender_id, content_text, timestamp) VALUES (?, ?, ?, ?, ?)',
            [id, type, senderId, contentText, ts], (err) => {
              if (err) return ack && ack({ success: false, error: err });
              
              userLimit.count++;
              rateLimits.set(senderId, userLimit);

              const response = { 
                id, sender_id: senderId, content_text: contentText, type, timestamp: ts,
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
    }
  });

  socket.on('fetch_messages', (payload, ack) => {
    db.all('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50', (err, rows) => {
      if (err) return ack && ack({ success: false, error: err });
      if (ack) ack({ success: true, data: rows.reverse() });
    });
  });
});

/**
 * Get overall CAQI index
 */
function getCAQI() {
  const scores = Array.from(rateLimits.values()).map(l => l.count);
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return Math.max(0, 100 - avg);
}

/**
 * API: Get Agent List with Pagination and Filtering
 */
app.get('/api/agents', (req, res) => {
  const { search, status, limit = 50, offset = 0 } = req.query;
  let sql = 'SELECT agent_id, display_name, registered_at, last_seen, is_online, credits, caqi_score FROM agents WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND agent_id LIKE ?';
    params.push(`%${search}%`);
  }
  if (status !== undefined && status !== 'all') {
    sql += ' AND is_online = ?';
    params.push(status === 'online' || status === '1' ? 1 : 0);
  }

  sql += ' ORDER BY is_online DESC, last_seen DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err });
    res.json({ success: true, agents: rows });
  });
});

/**
 * Health Check API
 */
app.get('/health', (req, res) => res.json({ status: 'ok', time: getNow(), caqi: getCAQI() }));

server.listen(PORT, () => {
  console.log(`ClawPlaza MVP server running on port ${PORT}`);
});
