const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, isNum } = require('../services/http');

const admin = [requireAuth, requireRole('admin')];
const bad = b => (!b.name ? 'Tax name is required'
  : !isNum(b.rate_percent) || Number(b.rate_percent) < 0 || Number(b.rate_percent) > 100 ? 'Rate must be between 0 and 100' : null);

router.get('/', requireAuth, wrap(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM taxes WHERE active ORDER BY id');
  res.json({ items: rows });
}));

router.post('/', ...admin, wrap(async (req, res) => {
  const err = bad(req.body);
  if (err) return res.status(400).json({ error: err });
  const { rows } = await pool.query('INSERT INTO taxes (name,rate_percent) VALUES ($1,$2) RETURNING *',
    [req.body.name, req.body.rate_percent]);
  res.status(201).json(rows[0]);
}));

router.put('/:id', ...admin, wrap(async (req, res) => {
  const err = bad(req.body);
  if (err) return res.status(400).json({ error: err });
  const { rows } = await pool.query('UPDATE taxes SET name=$1, rate_percent=$2 WHERE id=$3 RETURNING *',
    [req.body.name, req.body.rate_percent, req.params.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Tax not found' });
}));

// Soft delete: old invoices keep their tax percent
router.delete('/:id', ...admin, wrap(async (req, res) => {
  const { rowCount } = await pool.query('UPDATE taxes SET active=false WHERE id=$1', [req.params.id]);
  rowCount ? res.json({ message: 'Tax removed' }) : res.status(404).json({ error: 'Tax not found' });
}));

module.exports = router;
