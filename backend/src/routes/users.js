const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { passwordError } = require('./auth');

// Admin only: add a staff member
router.post('/staff', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, email, password } = req.body;
  const pwErr = passwordError(password);
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'staff') RETURNING id,name,email,role`,
      [name, email, await bcrypt.hash(password, 12)]);
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id,name,email,role FROM users WHERE id=$1', [req.user.id]);
  res.json(rows[0]);
});

module.exports = router;
