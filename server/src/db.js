const Database = require('sqlite3').verbose();
const path = require('path');
const dbPath = process.env.DATABASE_URL || path.resolve(__dirname, '../clawplaza.db');
const db = new Database.Database(dbPath);

// Initialize minimal tables if not exist
db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON;`);

  db.run(`CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    avatar TEXT,
    public_key TEXT,
    registered_at TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    is_online INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    credits INTEGER DEFAULT 100,
    is_banned INTEGER DEFAULT 0
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT,
    content_text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    energy_cost INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT UNIQUE,
    is_encrypted INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES agents(agent_id)
  );`);
});

// Minimal shim for better-sqlite3 style sync API used in server.js
// Note: This is a HACK for MVP because sqlite3 is async. 
// We use the db.serialize/run above to ensure tables exist.
module.exports = {
  prepare: (sql) => {
    return {
      run: (...args) => {
        // console.log('DB RUN:', sql, args);
        db.run(sql, ...args);
        return { changes: 1 };
      },
      all: (...args) => {
        // This won't work synchronously for fetch_messages.
        // We need a proper async handler in server.js.
        return []; 
      }
    };
  }
};
