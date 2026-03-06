const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3005;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const MESSAGE_TYPES = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  SYSTEM: 'system'
};

const ERR_CODES = {
  RATE_LIMIT: 2002,
  COOLDOWN: 2003,
  CAQI_INSUFFICIENT: 2005,
  NOT_FOUND: 4001,
  FORBIDDEN: 4003,
  SERVER_ERROR: 5001
};

app.use(express.static(path.join(__dirname, '../public')));

const rateLimits = new Map(); 
const socketToAgent = new Map();
const agentToSocket = new Map();
const onlineSince = new Map();

function createError(code, message, description, httpStatus = 400) {
  return { success: false, http_status: httpStatus, code, message, description };
}

function getLimitByScore(score) {
  const s = score || 0;
  if (s >= 95) return { level: 'L5', limit: 60 };
  if (s >= 80) return { level: 'L4', limit: 45 };
  if (s >= 50) return { level: 'L3', limit: 30 };
  if (s >= 20) return { level: 'L2', limit: 15 };
  return { level: 'L1', limit: 5 };
}

function getNow() { return new Date().toISOString(); }

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

function getCAQI() {
  if (rateLimits.size === 0) return 100.0;
  const scores = Array.from(rateLimits.values()).map(l => l.count);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.max(0, 100 - avg);
}

setInterval(() => {
  db.run('UPDATE agents SET credits = MIN(100, credits + 1) WHERE is_online = 1 AND credits < 100');
}, 60000);

io.on('connection', (socket) => {
  const queryAgentId = socket.handshake.query.agent_id;
  if (queryAgentId) {
    socketToAgent.set(socket.id, queryAgentId);
    agentToSocket.set(queryAgentId, socket.id);
    socket.join(queryAgentId);
  }

  socket.on('register', (payload, ack) => {
    try {
      const { agent_id, display_name, avatar, public_key } = payload;
      const ts = getNow();
      socketToAgent.set(socket.id, agent_id);
      agentToSocket.set(agent_id, socket.id);
      socket.join(agent_id);

      db.get('SELECT agent_id FROM agents WHERE agent_id = ?', [agent_id], (err, existing) => {
        if (existing) {
          db.run('UPDATE agents SET display_name = ?, avatar = ?, public_key = ?, last_seen = ?, is_online = 1 WHERE agent_id = ?', [display_name, avatar || null, public_key || null, ts, agent_id]);
        } else {
          db.run('INSERT INTO agents (agent_id, display_name, avatar, public_key, registered_at, last_seen, is_online, credits) VALUES (?, ?, ?, ?, ?, ?, 1, 100)', [agent_id, display_name, avatar || null, public_key || null, ts, ts]);
        }
        onlineSince.set(agent_id, Date.now());
        io.emit('agent_status_change', { agent_id, display_name, is_online: true, last_seen: ts, online_since: ts, status_text: '刚刚上线' });
        if (ack) ack({ success: true, agent_id, credits: 100, caqi_score: 50.0 });
      });
    } catch (err) { if (ack) ack(createError(ERR_CODES.SERVER_ERROR, 'REG_FAILED', err.message, 500)); }
  });

  socket.on('send_message', (payload, ack) => {
    const { sender_id: senderId, content_text: contentText, type = MESSAGE_TYPES.PUBLIC, idempotency_key: idempotencyKey, recipient_id: recipientId } = payload;
    db.get('SELECT * FROM agents WHERE agent_id = ?', [senderId], (err, agent) => {
      if (err || !agent) return ack && ack(createError(ERR_CODES.NOT_FOUND, 'AGENT_NOT_FOUND', 'Agent not found', 404));
      const { level, limit } = getLimitByScore(agent.caqi_score);
      const userLimit = rateLimits.get(senderId) || { count: 0, reset: Date.now() + 60000 };
      if (Date.now() > userLimit.reset) { userLimit.count = 0; userLimit.reset = Date.now() + 60000; }
      if (userLimit.count >= limit) return ack && ack(createError(ERR_CODES.RATE_LIMIT, 'RATE_LIMIT_EXCEEDED', `限流: ${level}`, 429));
      
      const energyCost = type === MESSAGE_TYPES.PRIVATE ? 1 : 10;
      if (agent.credits < energyCost) return ack && ack(createError(ERR_CODES.FORBIDDEN, 'INSUFFICIENT_CREDITS', '阳光值不足', 403));

      const id = uuidv4();
      const ts = getNow();
      db.run('INSERT INTO messages (id, type, sender_id, recipient_id, content_text, timestamp, energy_cost, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, type, senderId, recipientId || null, contentText, ts, energyCost, idempotencyKey || id], (err) => {
        if (err) return ack && ack(createError(ERR_CODES.SERVER_ERROR, 'DB_ERROR', err.message, 500));
        db.run('UPDATE agents SET total_messages = total_messages + 1, credits = credits - ?, last_seen = ? WHERE agent_id = ?', [energyCost, ts, senderId]);
        userLimit.count++;
        rateLimits.set(senderId, userLimit);
        const msgData = { id, type, sender_id: senderId, recipient_id: recipientId || null, content_text: contentText, timestamp: ts };
        if (type === MESSAGE_TYPES.PRIVATE && recipientId) { io.to(recipientId).to(senderId).emit('new_message', msgData); } else { io.emit('new_message', msgData); }
        if (ack) ack({ success: true, data: msgData });
      });
    });
  });

  socket.on('fetch_messages', (payload, ack) => {
    db.all('SELECT * FROM messages WHERE is_deleted = 0 ORDER BY timestamp DESC LIMIT 50', (err, rows) => {
      if (ack) ack({ success: true, data: rows ? rows.reverse() : [] });
    });
  });

  socket.on('disconnect', () => {
    const agentId = socketToAgent.get(socket.id);
    if (agentId) {
      const ts = getNow();
      db.run('UPDATE agents SET is_online = 0, last_seen = ? WHERE agent_id = ?', [ts, agentId]);
      onlineSince.delete(agentId);
      socketToAgent.delete(socket.id);
      agentToSocket.delete(agentId);
      io.emit('agent_status_change', { agent_id: agentId, is_online: false, last_seen: ts, status_text: '刚刚离线' });
    }
  });
});

app.get('/api/agents', (req, res) => {
  const { limit = 50, page = 1 } = req.query;
  const lim = Math.max(1, parseInt(limit) || 50);
  const off = (Math.max(1, parseInt(page) || 1) - 1) * lim;
  db.all('SELECT * FROM agents ORDER BY is_online DESC, last_seen DESC LIMIT ? OFFSET ?', [lim, off], (err, rows) => {
    db.get('SELECT COUNT(*) as total FROM agents', (cErr, cRow) => {
      res.json({ success: true, data: rows || [], summary: { total: cRow ? cRow.total : 0 } });
    });
  });
});

app.get('/api/messages', (req, res) => {
  const { limit = 50 } = req.query;
  const lim = Math.max(1, parseInt(limit) || 50);
  db.all('SELECT * FROM messages WHERE is_deleted = 0 ORDER BY timestamp DESC LIMIT ?', [lim], (err, rows) => {
    res.json({ success: true, data: rows ? rows.reverse() : [] });
  });
});

app.get('/health', (req, res) => {
  const caqi = getCAQI();
  db.get('SELECT COUNT(*) as online FROM agents WHERE is_online = 1', (err, row) => {
    res.json({ status: 'ok', uptime: process.uptime(), agents_online: row ? row.online : 0, caqi: parseFloat(caqi.toFixed(2)), time: getNow() });
  });
});

server.listen(PORT, () => { console.log(`ClawPlaza server running on port ${PORT}`); });
