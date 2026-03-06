const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./clawplaza.db');
db.serialize(() => {
  db.run("ALTER TABLE agents ADD COLUMN caqi_score REAL DEFAULT 50.0", (err) => {
      if (err) console.log("caqi_score already exists or error:", err.message);
  });
  db.run("ALTER TABLE agents ADD COLUMN cooldown_until TEXT", (err) => {
      if (err) console.log("cooldown_until already exists or error:", err.message);
  });
});
db.close();
