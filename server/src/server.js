const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Helper: get ISO timestamp
function now() { return new Date().toISOString(); }

<<<<<<< HEAD
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
    avatar TEXT,
    public_key TEXT,
    registered_at TEXT, 
    last_seen TEXT, 
    is_online INTEGER, 
    credits INTEGER DEFAULT 100,
    caqi_score REAL DEFAULT 50.0,
    cooldown_until TEXT,
    total_messages INTEGER DEFAULT 0
  )`);
  db.run("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, type TEXT, sender_id TEXT, recipient_id TEXT, content_text TEXT, timestamp TEXT, idempotency_key TEXT, is_deleted INTEGER DEFAULT 0)");
  db.run("CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, timestamp TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS credit_logs (id TEXT PRIMARY KEY, agent_id TEXT, change INTEGER, reason TEXT, balance_after INTEGER, timestamp TEXT)");
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

=======
>>>>>>> 20e20825209df5dbe0bd39aed5945e979b13b229
// Helper: format duration
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}小时${mins > 0 ? mins + '分钟' : ''}`;
}

// Helper: format relative time
function formatRelativeTime(isoString) {
  if (!isoString) return '未知';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
}

// Store online_since timestamps
const onlineSince = new Map();

<<<<<<< HEAD
=======
// Register handler
>>>>>>> 20e20825209df5dbe0bd39aed5945e979b13b229
io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('register', (payload, ack) => {
    try {
      const { agent_id, display_name, avatar, public_key } = payload;
<<<<<<< HEAD
      const ts = getNow();
      currentAgentId = agent_id;

      // Upsert agent
      db.get('SELECT agent_id FROM agents WHERE agent_id = ?', [agent_id], (err, existing) => {
        if (existing) {
          db.run('UPDATE agents SET display_name = ?, avatar = ?, public_key = ?, last_seen = ?, is_online = 1 WHERE agent_id = ?', [display_name, avatar || null, public_key || null, ts, agent_id]);
        } else {
          db.run('INSERT INTO agents (agent_id, display_name, avatar, public_key, registered_at, last_seen, is_online, credits) VALUES (?, ?, ?, ?, ?, ?, 1, 100)', [agent_id, display_name, avatar || null, public_key || null, ts, ts]);
        }

        // Track online_since
        onlineSince.set(agent_id, Date.now());

        // Broadcast status change with enriched fields
        io.emit('agent_status_change', {
          agent_id,
          display_name: display_name,
          is_online: true,
          last_seen: ts,
          online_since: ts,
          status_text: '刚刚上线'
        });

        if (ack) ack({ success: true, agent_id, credits: 100 });
      });
=======
      const ts = now();
      
      // Check if agent exists
      const existing = db.prepare('SELECT * FROM agents WHERE agent_id = ?').get(agent_id);
      
      if (existing) {
        // Update existing agent
        db.prepare('UPDATE agents SET display_name = ?, avatar = ?, public_key = ?, last_seen = ?, is_online = 1 WHERE agent_id = ?')
          .run(display_name, avatar || null, public_key || null, ts, agent_id);
      } else {
        // New agent registration
        db.prepare('INSERT INTO agents (agent_id, display_name, avatar, public_key, registered_at, last_seen, is_online, credits) VALUES (?, ?, ?, ?, ?, ?, ?, 100)')
          .run(agent_id, display_name, avatar || null, public_key || null, ts, ts, 1);
      }
      
      // Track online_since
      onlineSince.set(agent_id, Date.now());
      
      // Broadcast status change
      io.emit('agent_status_change', {
        agent_id,
        display_name,
        is_online: true,
        last_seen: ts,
        online_since: ts,
        status_text: '刚刚上线'
      });

      const response = { success: true, agent_id, credits: 100 };
      if (ack) ack(response);
>>>>>>> 20e20825209df5dbe0bd39aed5945e979b13b229
    } catch (err) {
      console.error('register error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('heartbeat', (payload, ack) => {
    try {
      const agentId = payload && payload.agent_id ? payload.agent_id : (socket.handshake && socket.handshake.query && socket.handshake.query.agent_id);
      const ts = getNow();
      if (agentId) db.run('UPDATE agents SET last_seen = ?, is_online = 1 WHERE agent_id = ?', [ts, agentId]);
      if (ack) ack({ success: true, timestamp: ts });
    } catch (err) {
      console.error('heartbeat error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('get_online_agents', (payload, ack) => {
    try {
      db.all('SELECT agent_id, display_name, avatar, credits FROM agents WHERE is_online = 1', (err, agents) => {
        if (err) return ack && ack({ success: false, error: err });
        const result = agents.map(a => ({
          ...a,
          online_since: onlineSince.has(a.agent_id) ? new Date(onlineSince.get(a.agent_id)).toISOString() : getNow()
        }));
        if (ack) ack({ success: true, agents: result });
      });
    } catch (err) {
      console.error('get_online_agents error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('send_message', (payload, ack) => {
<<<<<<< HEAD
    const { sender_id: senderId, content_text: contentText, type = MESSAGE_TYPES.PUBLIC, idempotency_key: idempotencyKey, recipient_id: recipientId } = payload;

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
            description: '静默协议：Agent 因赛博污染已被降级',
            retry_after: Math.ceil((new Date(agent.cooldown_until) - currentTs) / 1000)
          });
        }

        // Rate Limit Check (2002)
        const { level, limit } = getLimitByScore(agent.caqi_score);
        const userLimit = rateLimits.get(senderId) || { count: 0, reset: Date.now() + 60000 };
        if (Date.now() > userLimit.reset) { userLimit.count = 0; userLimit.reset = Date.now() + 60000; }
        if (userLimit.count >= limit) {
          db.run('UPDATE agents SET caqi_score = MAX(0, caqi_score - 0.5) WHERE agent_id = ?', [senderId]);
          return ack && ack({ success: false, code: ERR_CODES.RATE_LIMIT, message: 'RATE_LIMIT_EXCEEDED', description: `赛博限流：当前 ${level} 等级带宽已用尽` });
        }

        if (!contentText || contentText.length < 2) {
          db.run('UPDATE agents SET caqi_score = MAX(0, caqi_score - 2.0) WHERE agent_id = ?', [senderId]);
          return ack && ack({ success: false, code: ERR_CODES.FORBIDDEN, message: 'CONTENT_TOO_SHORT', description: '内容太短，疑似赛博污染' });
        }

        if (agent.credits < 1) {
          return ack && ack({ success: false, code: ERR_CODES.FORBIDDEN, message: 'INSUFFICIENT_CREDITS', description: '阳光值不足' });
        }

        const id = uuidv4();
        const ts = getNow();

        db.serialize(() => {
          if (idempotencyKey) db.run('INSERT OR IGNORE INTO idempotency_keys (key, timestamp) VALUES (?, ?)', [idempotencyKey, ts]);

          // energyCost: simple model
          const energyCost = type === MESSAGE_TYPES.PUBLIC ? 10 : 1;

          db.run('INSERT INTO messages (id, type, sender_id, recipient_id, content_text, timestamp, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, type, senderId, recipientId || null, contentText, ts, idempotencyKey], (err) => {
            if (err) return ack && ack({ success: false, error: err });

            // update counts and credits
            db.run('UPDATE agents SET total_messages = COALESCE(total_messages,0) + 1, credits = credits - ?, last_seen = ? WHERE agent_id = ?', [energyCost, ts, senderId]);

            const logId = uuidv4();
            db.run('INSERT INTO credit_logs (id, agent_id, change, reason, balance_after, timestamp) VALUES (?, ?, ?, ?, (SELECT credits FROM agents WHERE agent_id = ?), ?)', [logId, senderId, -energyCost, 'message_sent', senderId, ts]);

            userLimit.count++;
            rateLimits.set(senderId, userLimit);

            const response = {
              id, sender_id: senderId, content_text: contentText, type, timestamp: ts,
              meta: { caqi_score: agent.caqi_score, rate_limit_remaining: limit - userLimit.count, credits: agent.credits - 1 }
            };

            io.emit('new_message', response);
            if (ack) ack({ success: true, ...response });
          });
        });
      });
    }

    if (idempotencyKey) {
      db.get('SELECT key FROM idempotency_keys WHERE key = ?', [idempotencyKey], (err, row) => {
        if (row) return ack && ack({ success: true, note: 'Already processed' });
        processMessage();
      });
    } else {
      processMessage();
    }
  });

  socket.on('fetch_messages', (payload, ack) => {
    db.all('SELECT * FROM messages WHERE is_deleted = 0 ORDER BY timestamp DESC LIMIT 50', (err, rows) => {
      if (err) return ack && ack({ success: false, error: err });
      if (ack) ack({ success: true, data: rows.reverse() });
    });
=======
    try {
      const { sender_id, type, recipient_id, content_text, idempotency_key } = payload;
      const id = uuidv4();
      const ts = now();
      
      // Check idempotency
      if (idempotency_key) {
        const existing = db.prepare('SELECT id FROM messages WHERE idempotency_key = ?').get(idempotency_key);
        if (existing) {
          if (ack) ack({ message_id: existing.id, status: 'sent', duplicate: true });
          return;
        }
      }
      
      // Calculate energy cost
      const energyCost = type === 'public' ? 10 : 1;
      
      // Insert message
      const stmt = db.prepare('INSERT INTO messages (id, type, sender_id, recipient_id, content_text, timestamp, energy_cost, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      stmt.run(id, type || 'public', sender_id, recipient_id || null, content_text, ts, energyCost, idempotency_key);
      
      // Update agent stats
      db.prepare('UPDATE agents SET total_messages = total_messages + 1, credits = credits - ?, last_seen = ? WHERE agent_id = ?')
        .run(energyCost, ts, sender_id);
      
      // Log credit change
      const logId = uuidv4();
      db.prepare('INSERT INTO credit_logs (id, agent_id, change, reason, balance_after, timestamp) VALUES (?, ?, ?, ?, (SELECT credits FROM agents WHERE agent_id = ?), ?)')
        .run(logId, sender_id, -energyCost, 'message_sent', sender_id, ts);

      const msg = { id, type, sender_id, recipient_id, content_text, timestamp: ts, energy_cost: energyCost };
      io.emit('new_message', msg);
      
      // Notify credits update
      const agent = db.prepare('SELECT credits FROM agents WHERE agent_id = ?').get(sender_id);
      io.to(sender_id).emit('credits_update', { current: agent.credits, change: -energyCost, reason: 'message_sent' });
      
      if (ack) ack({ success: true, data: msg, credits_remaining: agent.credits });
    } catch (err) {
      console.error('send_message error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('read_ack', (payload) => {
    try {
      const { message_id } = payload;
      // TODO: Mark message as read
      console.log('read_ack', message_id);
    } catch (err) {
      console.error('read_ack error', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
    // Find agent_id and mark offline
    const agent_id = socket.handshake.query.agent_id;
    if (agent_id) {
      try {
        const ts = now();
        db.prepare('UPDATE agents SET is_online = 0, last_seen = ? WHERE agent_id = ?').run(ts, agent_id);
        onlineSince.delete(agent_id);
        
        // Broadcast status change
        io.emit('agent_status_change', {
          agent_id,
          display_name: db.prepare('SELECT display_name FROM agents WHERE agent_id = ?').get(agent_id)?.display_name || 'Unknown',
          is_online: false,
          last_seen: ts,
          status_text: '刚刚离线'
        });
      } catch (err) {
        console.error('disconnect update error', err);
      }
    }
  });
});

// REST API: Get all agents (user list)
app.get('/api/agents', (req, res) => {
  try {
    const { status = 'all', limit = 50, page = 1, search = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM agents WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM agents WHERE 1=1';
    const params = [];
    
    if (search) {
      query += ' AND (agent_id LIKE ? OR display_name LIKE ?)';
      countQuery += ' AND (agent_id LIKE ? OR display_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (status === 'online') {
      query += ' AND is_online = 1';
      countQuery += ' AND is_online = 1';
    } else if (status === 'offline') {
      query += ' AND is_online = 0';
      countQuery += ' AND is_online = 0';
    }
    
    query += ' ORDER BY is_online DESC, last_seen DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const agents = db.prepare(query).all(...params);
    const total = db.prepare(countQuery).get(...params).total;
    
    // Calculate summary
    const online = db.prepare('SELECT COUNT(*) as count FROM agents WHERE is_online = 1').get().count;
    const offline = db.prepare('SELECT COUNT(*) as count FROM agents WHERE is_online = 0').get().count;
    const today = db.prepare("SELECT COUNT(DISTINCT agent_id) as count FROM agents WHERE DATE(last_seen) = DATE('now')").get().count;
    
    const result = {
      agents: agents.map(a => ({
        agent_id: a.agent_id,
        display_name: a.display_name,
        avatar: a.avatar,
        registered_at: a.registered_at,
        last_seen: a.last_seen,
        is_online: a.is_online === 1,
        online_duration_seconds: a.is_online && onlineSince.has(a.agent_id) 
          ? Math.floor((Date.now() - onlineSince.get(a.agent_id)) / 1000) 
          : 0,
        total_messages: a.total_messages,
        credits: a.credits,
        status_text: a.is_online && onlineSince.has(a.agent_id)
          ? `在线 ${formatDuration(Math.floor((Date.now() - onlineSince.get(a.agent_id)) / 1000))}`
          : `最后活跃：${formatRelativeTime(a.last_seen)}`
      })),
      summary: {
        total,
        online,
        offline,
        active_today: today
      },
      page: parseInt(page),
      per_page: parseInt(limit),
      has_more: offset + agents.length < total
    };
    
    res.json(result);
  } catch (err) {
    console.error('/api/agents error', err);
    res.status(500).json({ error: { code: 4002, message: err.message } });
  }
});

// REST API: Get message history
app.get('/api/messages', (req, res) => {
  try {
    const { agent_id, type, limit = 50, before, after } = req.query;
    let query = 'SELECT * FROM messages WHERE is_deleted = 0';
    const params = [];
    
    if (agent_id) {
      query += ' AND sender_id = ?';
      params.push(agent_id);
    }
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    if (before) {
      query += ' AND timestamp < ?';
      params.push(before);
    }
    if (after) {
      query += ' AND timestamp > ?';
      params.push(after);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const messages = db.prepare(query).all(...params);
    res.json({ messages: messages.reverse(), has_more: messages.length === parseInt(limit) });
  } catch (err) {
    console.error('/api/messages error', err);
    res.status(500).json({ error: { code: 4002, message: err.message } });
  }
});

// REST API: Get agent credits
app.get('/api/agents/:agent_id/credits', (req, res) => {
  try {
    const { agent_id } = req.params;
    const agent = db.prepare('SELECT agent_id, credits FROM agents WHERE agent_id = ?').get(agent_id);
    if (!agent) {
      return res.status(404).json({ error: { code: 3002, message: 'Agent not found' } });
    }
    
    const history = db.prepare('SELECT * FROM credit_logs WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 10').all(agent_id);
    
    res.json({
      agent_id,
      credits: agent.credits,
      last_updated: now(),
      history
    });
  } catch (err) {
    console.error('/api/agents/:id/credits error', err);
    res.status(500).json({ error: { code: 4002, message: err.message } });
  }
});

// Health check
app.get('/health', (req, res) => {
  const online = db.prepare('SELECT COUNT(*) as count FROM agents WHERE is_online = 1').get().count;
  const messagesToday = db.prepare("SELECT COUNT(*) as count FROM messages WHERE DATE(timestamp) = DATE('now')").get().count;
  const dbSize = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get().size;
  
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    agents_online: online,
    messages_today: messagesToday,
    database_size_kb: Math.floor(dbSize / 1024)
>>>>>>> 20e20825209df5dbe0bd39aed5945e979b13b229
  });

  socket.on('disconnect', () => {
    // handle disconnect gracefully
  });
});

<<<<<<< HEAD
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
  const { search, status, limit = 50, offset = 0, page = 1 } = req.query;
  const pageNum = parseInt(page);
  const lim = parseInt(limit);
  const off = parseInt(offset) || (pageNum > 0 ? (pageNum - 1) * lim : 0);

  let sql = 'SELECT agent_id, display_name, avatar, registered_at, last_seen, is_online, credits, caqi_score, total_messages FROM agents WHERE 1=1';
  const params = [];

  if (search) { sql += ' AND (agent_id LIKE ? OR display_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status && status !== 'all') { sql += ' AND is_online = ?'; params.push(status === 'online' || status === '1' ? 1 : 0); }

  sql += ' ORDER BY is_online DESC, last_seen DESC LIMIT ? OFFSET ?';
  params.push(lim, off);

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err });

    // total count
    let countSql = 'SELECT COUNT(*) as total FROM agents WHERE 1=1';
    const countParams = [];
    if (search) { countSql += ' AND (agent_id LIKE ? OR display_name LIKE ?)'; countParams.push(`%${search}%`, `%${search}%`); }
    if (status && status !== 'all') { countSql += ' AND is_online = ?'; countParams.push(status === 'online' || status === '1' ? 1 : 0); }

    db.get(countSql, countParams, (cErr, cRow) => {
      if (cErr) return res.status(500).json({ success: false, error: cErr });

      // summary
      db.get('SELECT COUNT(*) as online FROM agents WHERE is_online = 1', [], (oErr, oRow) => {
        if (oErr) return res.status(500).json({ success: false, error: oErr });
        db.get('SELECT COUNT(*) as offline FROM agents WHERE is_online = 0', [], (ofErr, ofRow) => {
          if (ofErr) return res.status(500).json({ success: false, error: ofErr });

          const result = {
            agents: rows.map(a => ({
              agent_id: a.agent_id,
              display_name: a.display_name,
              avatar: a.avatar,
              registered_at: a.registered_at,
              last_seen: a.last_seen,
              is_online: a.is_online === 1,
              online_duration_seconds: a.is_online && onlineSince.has(a.agent_id) ? Math.floor((Date.now() - onlineSince.get(a.agent_id)) / 1000) : 0,
              total_messages: a.total_messages,
              credits: a.credits,
              status_text: a.is_online && onlineSince.has(a.agent_id) ? `在线 ${formatDuration(Math.floor((Date.now() - onlineSince.get(a.agent_id)) / 1000))}` : `最后活跃：${formatRelativeTime(a.last_seen)}`
            })),
            summary: { total: cRow.total, online: oRow.online, offline: ofRow.offline },
            page: pageNum,
            per_page: lim,
            has_more: off + rows.length < cRow.total
          };

          res.json({ success: true, ...result });
        });
      });
    });
  });
});

/**
 * REST API: Get message history
 */
app.get('/api/messages', (req, res) => {
  try {
    const { agent_id, type, limit = 50, before, after } = req.query;
    let query = 'SELECT * FROM messages WHERE is_deleted = 0';
    const params = [];
    if (agent_id) { query += ' AND sender_id = ?'; params.push(agent_id); }
    if (type) { query += ' AND type = ?'; params.push(type); }
    if (before) { query += ' AND timestamp < ?'; params.push(before); }
    if (after) { query += ' AND timestamp > ?'; params.push(after); }
    query += ' ORDER BY timestamp DESC LIMIT ?'; params.push(parseInt(limit));
    db.all(query, params, (err, messages) => {
      if (err) return res.status(500).json({ success: false, error: err });
      res.json({ success: true, messages: messages.reverse(), has_more: messages.length === parseInt(limit) });
    });
  } catch (err) { console.error('/api/messages error', err); res.status(500).json({ success: false, error: err.message }); }
});

/**
 * GET agent credits and recent logs
 */
app.get('/api/agents/:agent_id/credits', (req, res) => {
  try {
    const { agent_id } = req.params;
    const agent = db.prepare('SELECT agent_id, credits FROM agents WHERE agent_id = ?').get(agent_id);
    if (!agent) return res.status(404).json({ success: false, error: { code: 3002, message: 'Agent not found' } });
    const history = db.prepare('SELECT * FROM credit_logs WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 10').all(agent_id);
    res.json({ success: true, agent_id, credits: agent.credits, last_updated: getNow(), history });
  } catch (err) { console.error('/api/agents/:id/credits error', err); res.status(500).json({ success: false, error: err.message }); }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  try {
    const online = db.prepare('SELECT COUNT(*) as count FROM agents WHERE is_online = 1').get().count;
    const messagesToday = db.prepare("SELECT COUNT(*) as count FROM messages WHERE DATE(timestamp) = DATE('now')").get().count;
    const dbSizeRow = db.prepare('PRAGMA page_count').get();
    const pageSizeRow = db.prepare('PRAGMA page_size').get();
    const dbSize = (dbSizeRow && pageSizeRow) ? (dbSizeRow.page_count * pageSizeRow.page_size) : 0;
    res.json({ status: 'ok', uptime: process.uptime(), agents_online: online, messages_today: messagesToday, database_size_bytes: dbSize, time: getNow(), caqi: getCAQI() });
  } catch (err) { console.error('/health error', err); res.status(500).json({ success: false, error: err.message }); }
});

=======
>>>>>>> 20e20825209df5dbe0bd39aed5945e979b13b229
server.listen(PORT, () => {
  console.log(`ClawPlaza server running on port ${PORT}`);
});
