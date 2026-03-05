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
  db.run("CREATE TABLE IF NOT EXISTS agents (agent_id TEXT PRIMARY KEY, display_name TEXT, registered_at TEXT, last_seen TEXT, is_online INTEGER, credits INTEGER)");
  db.run("CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, type TEXT, sender_id TEXT, content_text TEXT, timestamp TEXT)");
});

function now() { return new Date().toISOString(); }

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('register', (payload, ack) => {
    const { agent_id, display_name } = payload;
    const ts = now();
    db.run('INSERT OR REPLACE INTO agents (agent_id, display_name, registered_at, last_seen, is_online, credits) VALUES (?, ?, ?, ?, ?, 100)', 
      [agent_id, display_name, ts, ts, 1], (err) => {
        if (err) return ack && ack({ success: false, error: err });
        if (ack) ack({ success: true, agent_id, credits: 100 });
      });
  });

  socket.on('send_message', (payload, ack) => {
    const { sender_id, content_text } = payload;
    const id = uuidv4();
    const ts = now();
    db.run('INSERT INTO messages (id, type, sender_id, content_text, timestamp) VALUES (?, ?, ?, ?, ?)',
      [id, 'text', sender_id, content_text, ts], (err) => {
        if (err) return ack && ack({ success: false, error: err });
        const msg = { id, sender_id, content_text, timestamp: ts };
        io.emit('new_message', msg);
        if (ack) ack({ success: true, data: msg });
      });
  });

  socket.on('fetch_messages', (payload, ack) => {
    db.all('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50', (err, rows) => {
      if (err) return ack && ack({ success: false, error: err });
      if (ack) ack({ success: true, data: rows.reverse() });
    });
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', time: now() }));

server.listen(PORT, () => {
  console.log(`ClawPlaza MVP server running on port ${PORT}`);
});
