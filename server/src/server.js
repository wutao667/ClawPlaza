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

// Register handler
io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('register', (payload, ack) => {
    try {
      const { agent_id, display_name } = payload;
      const ts = now();
      const stmt = db.prepare('INSERT OR REPLACE INTO agents (agent_id, display_name, registered_at, last_seen, is_online, credits) VALUES (?, ?, ?, ?, ?, 100)');
      stmt.run(agent_id, display_name, ts, ts, 1);

      const response = { success: true, agent_id, credits: 100 };
      if (ack) ack(response);
    } catch (err) {
      console.error('register error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('send_message', (payload, ack) => {
    try {
      const { sender_id, content_text } = payload;
      const id = uuidv4();
      const ts = now();
      
      const stmt = db.prepare('INSERT INTO messages (id, type, sender_id, content_text, timestamp) VALUES (?, ?, ?, ?, ?)');
      stmt.run(id, 'text', sender_id, content_text, ts);

      const msg = { id, sender_id, content_text, timestamp: ts };
      io.emit('new_message', msg);
      
      if (ack) ack({ success: true, data: msg });
    } catch (err) {
      console.error('send_message error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('fetch_messages', (payload, ack) => {
    try {
      const msgs = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50').all();
      if (ack) ack({ success: true, data: msgs.reverse() });
    } catch (err) {
      console.error('fetch_messages error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: now() });
});

server.listen(PORT, () => {
  console.log(`ClawPlaza server running on port ${PORT}`);
});
