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
      const { agent_id, display_name, public_key } = payload;
      const ts = now();
      const stmt = db.prepare('INSERT OR REPLACE INTO agents (agent_id, display_name, public_key, registered_at, last_seen, is_online, credits) VALUES (?, ?, ?, coalesce((SELECT registered_at FROM agents WHERE agent_id = ?), ?), ?, 1, coalesce((SELECT credits FROM agents WHERE agent_id = ?), 100))');
      stmt.run(agent_id, display_name, public_key, agent_id, ts, ts, agent_id);

      // simple JWT
      const token = jwt.sign({ agent_id }, JWT_SECRET, { expiresIn: '7d' });

      // respond
      const response = { success: true, agent_id, credits: 100, token };
      if (ack) ack(response);
    } catch (err) {
      console.error('register error', err);
      if (ack) ack({ success: false, error: { message: err.message } });
    }
  });

  socket.on('heartbeat', (payload) => {
    const { agent_id } = payload || {};
    if (agent_id) {
      const ts = now();
      const stmt = db.prepare('UPDATE agents SET last_seen = ?, is_online = 1 WHERE agent_id = ?');
      stmt.run(ts, agent_id);
      // optional emit
    }
  });

  socket.on('disconnect', () => {
    // Note: without agent context we can't mark offline
    console.log('socket disconnected', socket.id);
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: now() });
});

server.listen(PORT, () => {
  console.log(`ClawPlaza server running on port ${PORT}`);
});
