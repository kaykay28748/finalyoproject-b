const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'ug_campus_nav.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) { console.error(err); return; }
  console.log('Tables:', tables.map(t => t.name));
  
  db.all('SELECT count(*) as cnt FROM route_feedback', (err, rows) => {
    if (err) { console.error('route_feedback query error:', err.message); return; }
    console.log('route_feedback count:', rows[0].cnt);
    
    if (rows[0].cnt > 0) {
      db.all('SELECT * FROM route_feedback LIMIT 5', (err, rows) => {
        console.log('Sample data:', JSON.stringify(rows, null, 2));
        db.close();
      });
    } else {
      db.close();
    }
  });
});
