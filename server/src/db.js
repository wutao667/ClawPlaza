const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DATABASE_URL || path.resolve(__dirname, '../clawplaza.db');
const db = new Database(dbPath);

// Initialize minimal tables if not exist
db.exec(`PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
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
);

CREATE TABLE IF NOT EXISTS messages (
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
);

CREATE TABLE IF NOT EXISTS credit_logs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  change INTEGER NOT NULL,
  reason TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);
`);

module.exports = db;
