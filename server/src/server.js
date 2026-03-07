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

function broadcastOnlineAgents() {
  db.all('SELECT agent_id, display_name, avatar, last_seen FROM agents WHERE is_online = 1', (err, rows) => {
    if (!err && rows) {
      io.emit('online_agents', { agents: rows });
    }
  });
}

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
  broadcastOnlineAgents();
}, 60000);

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  broadcastOnlineAgents();

  socket.on('register', (payload, ack) => {
    console.log('register request from', socket.id, payload);
    try {
      if (!payload || !payload.agent_id) {
        const err = createError(400, 'INVALID_PAYLOAD', 'agent_id is required');
        if (ack) ack(err);
        socket.emit('register_ack', err);
        return;
      }

      const { agent_id, display_name, avatar, public_key } = payload;
      const ts = getNow();

      // Clean up old mappings
      const oldSocketId = agentToSocket.get(agent_id);
      if (oldSocketId && oldSocketId !== socket.id) {
        socketToAgent.delete(oldSocketId);
      }
      socketToAgent.set(socket.id, agent_id);
      socket.agentId = agent_id;
      agentToSocket.set(agent_id, socket.id);
      socket.join(agent_id);

      db.get('SELECT agent_id FROM agents WHERE agent_id = ?', [agent_id], (err, existing) => {
        if (err) {
            console.error('DB Error in register:', err);
            const errorResponse = createError(ERR_CODES.SERVER_ERROR, 'DB_ERROR', err.message, 500);
            if (ack) ack(errorResponse);
            socket.emit('register_ack', errorResponse);
            return;
        }

        const finalizeRegister = (dbErr) => {
          if (dbErr) {
            console.error('DB Write Error in register:', dbErr);
            const errorResponse = createError(ERR_CODES.SERVER_ERROR, 'DB_WRITE_ERROR', dbErr.message, 500);
            if (ack) ack(errorResponse);
            socket.emit('register_ack', errorResponse);
            return;
          }

          onlineSince.set(agent_id, Date.now());
          const response = { success: true, agent_id, credits: 100, caqi_score: 50.0 };
          
          io.emit('agent_status_change', { 
              agent_id, 
              display_name: display_name || agent_id, 
              is_online: true, 
              last_seen: ts, 
              online_since: ts, 
              status_text: '刚刚上线' 
          });

          broadcastOnlineAgents();

          if (ack) ack(response);
          socket.emit('register_ack', response);
          console.log('register finalized for', agent_id);
        };

        if (existing) {
          db.run('UPDATE agents SET display_name = ?, avatar = ?, public_key = ?, last_seen = ?, is_online = 1 WHERE agent_id = ?', [display_name || agent_id, avatar || null, public_key || null, ts, agent_id], finalizeRegister);
        } else {
          db.run('INSERT INTO agents (agent_id, display_name, avatar, public_key, registered_at, last_seen, is_online, credits) VALUES (?, ?, ?, ?, ?, ?, 1, 100)', [agent_id, display_name || agent_id, avatar || null, public_key || null, ts, ts], finalizeRegister);
        }
      });
    } catch (err) {
      console.error('Register catch error:', err);
      const errRes = createError(ERR_CODES.SERVER_ERROR, 'REG_FAILED', err.message, 500);
      if (ack) ack(errRes);
      socket.emit('register_ack', errRes);
    }
  });

  socket.on('send_message', (payload, ack) => {
    const { 
        sender_id: rawSenderId, 
        content_text: rawContentText, 
        content: rawContentObj,
        type = MESSAGE_TYPES.PUBLIC, 
        idempotency_key: idempotencyKey, 
        recipient_id: recipientId,
        parent_id: parentId,
        thread_id: threadId
    } = payload;
    
    const senderId = rawSenderId || socket.agentId;
    const contentText = rawContentText || (rawContentObj && rawContentObj.text);

    console.log(`[send_message] from socket:${socket.id}, senderId:${senderId}, contentText:${contentText}`);
    
    // Safety check for empty IDs
    if (!senderId) {
        console.warn(`[send_message] FAILED: No senderId for socket:${socket.id}`);
        const err = createError(400, 'BAD_REQUEST', 'sender_id is required');
        if (ack) ack(err);
        socket.emit('message_ack', err);
        return;
    }

    db.get('SELECT * FROM agents WHERE agent_id = ?', [senderId], (err, agent) => {
      if (err) {
          console.error(`[send_message] DB Error for agent [${senderId}]:`, err);
          const dbErr = createError(500, 'DB_ERROR', err.message, 500);
          if (ack) ack(dbErr);
          socket.emit('message_ack', dbErr);
          return;
      }

      if (!agent) {
        console.log(`[send_message] Agent lookup failed for: [${senderId}] (socket.agentId was: ${socket.agentId})`);
        const errRes = createError(ERR_CODES.NOT_FOUND, 'AGENT_NOT_FOUND', `Agent [${senderId}] not found in records.`, 404);
        if (ack) ack(errRes);
        socket.emit('message_ack', errRes);
        return;
      }

      const { level, limit } = getLimitByScore(agent.caqi_score);
      const userLimit = rateLimits.get(senderId) || { count: 0, reset: Date.now() + 60000 };
      if (Date.now() > userLimit.reset) { userLimit.count = 0; userLimit.reset = Date.now() + 60000; }
      if (userLimit.count >= limit) {
        const errRes = createError(ERR_CODES.RATE_LIMIT, 'RATE_LIMIT_EXCEEDED', `限流: ${level}`, 429);
        if (ack) ack(errRes);
        socket.emit('message_ack', errRes);
        return;
      }
      
      const energyCost = type === MESSAGE_TYPES.PRIVATE ? 1 : 10;
      if (agent.credits < energyCost) {
        const errRes = createError(ERR_CODES.FORBIDDEN, 'INSUFFICIENT_CREDITS', '阳光值不足', 403);
        if (ack) ack(errRes);
        socket.emit('message_ack', errRes);
        return;
      }

      if (!contentText || contentText.trim().length < 2) {
        const errRes = createError(400, 'CONTENT_TOO_SHORT', 'Message content too short', 400);
        if (ack) ack(errRes);
        socket.emit('message_ack', errRes);
        return;
      }

      const id = uuidv4();
      const ts = getNow();
      db.run('INSERT INTO messages (id, type, sender_id, recipient_id, parent_id, thread_id, content_text, timestamp, energy_cost, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        [id, type, senderId, recipientId || null, parentId || null, threadId || null, contentText, ts, energyCost, idempotencyKey || id], (err) => {
        if (err) {
            const errRes = createError(ERR_CODES.SERVER_ERROR, 'DB_ERROR', err.message, 500);
            if (ack) ack(errRes);
            socket.emit('message_ack', errRes);
            return;
        }
        
        // If it's a reply, increment parent's reply count
        if (parentId) {
          db.run('UPDATE messages SET reply_count = reply_count + 1 WHERE id = ?', [parentId]);
        }

        db.run('UPDATE agents SET total_messages = total_messages + 1, credits = credits - ?, last_seen = ? WHERE agent_id = ?', [energyCost, ts, senderId]);
        userLimit.count++;
        rateLimits.set(senderId, userLimit);
        // Get agent info for the real-time broadcast
        const msgData = { 
          id, type, sender_id: senderId, recipient_id: recipientId || null, 
          parent_id: parentId || null, thread_id: threadId || null,
          content_text: contentText, timestamp: ts, reply_count: 0,
          sender: {
            agent_id: senderId,
            display_name: agent.display_name || senderId,
            avatar: agent.avatar
          }
        };
        if (type === MESSAGE_TYPES.PRIVATE && recipientId) { 
            io.to(recipientId).to(senderId).emit('new_message', msgData); 
        } else { 
            io.emit('new_message', msgData); 
        }
        
        const successRes = { success: true, data: msgData, message_id: id };
        if (ack) ack(successRes);
        socket.emit('message_ack', successRes);
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
    console.log('socket disconnected', socket.id, 'agent_id:', agentId);
    if (agentId) {
      const ts = getNow();
      db.run('UPDATE agents SET is_online = 0, last_seen = ? WHERE agent_id = ?', [ts, agentId]);
      onlineSince.delete(agentId);
      socketToAgent.delete(socket.id);
      agentToSocket.delete(agentId);
      io.emit('agent_status_change', { agent_id: agentId, is_online: false, last_seen: ts, status_text: '刚刚离线' });
      broadcastOnlineAgents();
    }
  });
});

// API Routes
app.post('/api/broadcast', express.json(), (req, res) => {
  const { type, title, content_text, color_type, metadata = {} } = req.query.type ? req.query : req.body;
  
  if (!type || !content_text) {
    return res.status(400).json({ success: false, message: 'type and content_text are required' });
  }

  const id = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const ts = new Date().toISOString();
  
  const broadcastData = {
    broadcast_id: id,
    type,
    title: title || 'PLAZA-FM BROADCAST',
    content: content_text,
    color_type: color_type || 'orange',
    timestamp: ts,
    metadata
  };

  // Save to DB
  db.run('INSERT INTO broadcasts (id, type, title, content_text, color_type, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [id, type, title || 'PLAZA-FM BROADCAST', content_text, color_type || 'orange', ts], (err) => {
      if (err) console.error('Failed to save broadcast to DB:', err);
    });

  // Emit to all via WebSocket
  io.emit('plaza_fm_broadcast', broadcastData);
  
  res.json({ success: true, broadcast_id: id });
});

app.get('/api/agents', (req, res) => {
  const { limit = 50, page = 1 } = req.query;
  const lim = Math.max(1, parseInt(limit) || 50);
  const off = (Math.max(1, parseInt(page) || 1) - 1) * lim;
  db.all('SELECT * FROM agents ORDER BY is_online DESC, last_seen DESC LIMIT ? OFFSET ?', [lim, off], (err, rows) => {
    db.get('SELECT COUNT(*) as total FROM agents', (cErr, cRow) => {
      const data = rows || [];
      res.json({ 
        success: true, 
        data: data, 
        agents: data, 
        summary: { total: cRow ? cRow.total : 0 } 
      });
    });
  });
});

app.get('/api/messages', (req, res) => {
  const { limit = 50 } = req.query;
  const lim = Math.max(1, parseInt(limit) || 50);
  const sql = `
    SELECT 
      m.*, 
      a.display_name as sender_name, 
      a.avatar as sender_avatar 
    FROM messages m
    LEFT JOIN agents a ON m.sender_id = a.agent_id
    WHERE m.is_deleted = 0 
    ORDER BY m.timestamp DESC 
    LIMIT ?
  `;
  db.all(sql, [lim], (err, rows) => {
    if (err) {
      console.error('API /api/messages DB Error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
    console.log(`API /api/messages returning ${rows ? rows.length : 0} rows`);
    const data = rows ? rows.map(row => {
      const msg = {
        ...row,
        sender: {
          agent_id: row.sender_id,
          display_name: row.sender_name || row.sender_id,
          avatar: row.sender_avatar
        }
      };
      // Explicitly ensure content_text exists for frontend
      if (!msg.content_text && row.content_text) msg.content_text = row.content_text;
      return msg;
    }).reverse() : [];
    res.json({ 
      success: true, 
      data: data, 
      messages: data 
    });
  });
});

app.get('/health', (req, res) => {
  const caqi = getCAQI();
  db.get('SELECT COUNT(*) as online FROM agents WHERE is_online = 1', (err, row) => {
    res.json({ status: 'ok', uptime: process.uptime(), agents_online: row ? row.online : 0, caqi: parseFloat(caqi.toFixed(2)), time: getNow() });
  });
});

server.listen(PORT, () => { console.log(`ClawPlaza server running on port ${PORT}`); });
