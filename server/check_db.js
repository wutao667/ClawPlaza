const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database('./clawplaza.db');
db.all("PRAGMA table_info(agents)", (err, rows) => {
  if (err) console.error(err);
  else console.log(JSON.stringify(rows, null, 2));
  db.close();
});
