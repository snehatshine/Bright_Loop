require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

async function applyIndexes() {
  const sqlPath = path.join(__dirname, 'indexes.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await pool.query(sql);
    console.log('Indexes applied successfully.');
  } catch (err) {
    console.error('Failed to apply indexes:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyIndexes();
