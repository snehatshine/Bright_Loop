// Usage: node db/seed-admin.js admin@brightloop.com 'Str0ng!Pass'
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db');
(async () => {
  const [email, pw] = process.argv.slice(2);
  await pool.query(`INSERT INTO users (name,email,password_hash,role) VALUES ('Admin',$1,$2,'admin')`,
    [email, await bcrypt.hash(pw, 12)]);
  console.log('Admin created:', email);
  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
