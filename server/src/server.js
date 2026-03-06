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

// Register handler
io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('register', (payload, ack) => {
    try {
      const { agent_id, display_name, avatar, public_key } = payload;
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
    } catch (err) {
      console.error('register error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('heartbeat', (payload, ack) => {
    try {
      const { agent_id } = socket.handshake.query;
      const ts = now();
      
      db.prepare('UPDATE agents SET last_seen = ?, is_online = 1 WHERE agent_id = ?').run(ts, agent_id);
      
      if (ack) ack({ success: true, timestamp: ts });
    } catch (err) {
      console.error('heartbeat error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('get_online_agents', (payload, ack) => {
    try {
      const agents = db.prepare('SELECT agent_id, display_name, avatar, credits FROM agents WHERE is_online = 1').all();
      const result = agents.map(a => ({
        ...a,
        online_since: onlineSince.has(a.agent_id) ? new Date(onlineSince.get(a.agent_id)).toISOString() : now()
      }));
      if (ack) ack({ agents: result });
    } catch (err) {
      console.error('get_online_agents error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('send_message', (payload, ack) => {
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
  });
});

server.listen(PORT, () => {
  console.log(`ClawPlaza server running on port ${PORT}`);
});
