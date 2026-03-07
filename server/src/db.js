const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = process.env.DATABASE_URL || path.resolve(__dirname, '../clawplaza.db');
const db = new sqlite3.Database(dbPath);

// Initialize Database Schema if not exists
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
    caqi_score REAL DEFAULT 50.0,
    cooldown_until TEXT,
    is_banned INTEGER DEFAULT 0
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    recipient_id TEXT,
    parent_id TEXT,
    thread_id TEXT,
    reply_count INTEGER DEFAULT 0,
    content_text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    energy_cost INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT UNIQUE,
    is_encrypted INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES agents(agent_id),
    FOREIGN KEY (parent_id) REFERENCES messages(id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- welcome, caqi-downgrade, announcement, daily-recovery, milestone
    title TEXT NOT NULL,
    content_text TEXT NOT NULL,
    color_type TEXT NOT NULL, -- green, red, blue, orange, purple
    timestamp TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY, 
    timestamp TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS credit_logs (
    id TEXT PRIMARY KEY, 
    agent_id TEXT, 
    change INTEGER, 
    reason TEXT, 
    balance_after INTEGER, 
    timestamp TEXT
  )`);
});

module.exports = db;
