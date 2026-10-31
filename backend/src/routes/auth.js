const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');

// More than 8 chars, upper, lower, special
function passwordError(pw) {
  if (typeof pw !== 'string' || pw.length <= 8) return 'Password must be more than 8 characters';
  if (!/[A-Z]/.test(pw)) return 'Password needs an uppercase letter';
  if (!/[a-z]/.test(pw)) return 'Password needs a lowercase letter';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password needs a special character';
  return null;
}
const sign = u => jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
const validEmail = e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Public signup always creates a CUSTOMER. Staff are added by admin only.
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !validEmail(email)) return res.status(400).json({ error: 'Valid name and email required' });
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'customer')
       RETURNING id, name, email, role`, [name, email, hash]);
    res.status(201).json({ user: rows[0], token: sign(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email || '']);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
    return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role }, token: sign(u) });
});

async function sendMail(to, subject, text) {
  if (!process.env.SMTP_HOST) return console.log(`[DEV EMAIL] to=${to}\n${subject}\n${text}`);
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await t.sendMail({ from: process.env.SMTP_USER, to, subject, text });
}

// Always answers 200 so it can't reveal which emails exist
router.post('/forgot-password', async (req, res) => {
  const { rows } = await pool.query('SELECT id, email FROM users WHERE email = $1', [req.body.email || '']);
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(`UPDATE users SET reset_token_hash=$1, reset_expires=now()+interval '1 hour' WHERE id=$2`,
      [hash, rows[0].id]);
    await sendMail(rows[0].email, 'Reset your Brightloop password',
      `Reset link (valid 1 hour): ${process.env.APP_URL}/reset-password?token=${token}`);
  }
  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const hash = crypto.createHash('sha256').update(token || '').digest('hex');
  const newHash = await bcrypt.hash(password, 12);
  const { rowCount } = await pool.query(
    `UPDATE users SET password_hash=$1, reset_token_hash=NULL, reset_expires=NULL
     WHERE reset_token_hash=$2 AND reset_expires > now()`, [newHash, hash]);
  if (!rowCount) return res.status(400).json({ error: 'Invalid or expired reset link' });
  res.json({ message: 'Password updated' });
});

module.exports = router;
module.exports.passwordError = passwordError;
