const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, paging, isNum } = require('../services/http');

const admin = [requireAuth, requireRole('admin')];
const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];

function clean(b) {
  if (!b.name) return { error: 'Plan name is required' };
  if (!isNum(b.price) || Number(b.price) < 0) return { error: 'Price must be 0 or more' };
  if (!PERIODS.includes(b.period)) return { error: 'Billing period must be daily, weekly, monthly or yearly' };
  const min = b.min_quantity === undefined ? 1 : Number(b.min_quantity);
  if (!Number.isInteger(min) || min < 1) return { error: 'Minimum quantity must be 1 or more' };
  const from = b.available_from || null, to = b.available_to || null;
  if (from && to && to < from) return { error: 'Available-to date must be on or after available-from' };
  const flag = k => b[k] === true || b[k] === 'true';
  return { value: [b.name, b.price, b.period, min, from, to,
                   flag('auto_close'), flag('closable'), flag('pausable'), flag('renewable')] };
}

// ?available=true limits to plans open for sale today
router.get('/', requireAuth, wrap(async (req, res) => {
  const { limit, offset, page } = paging(req);
  const onlyOpen = req.query.available === 'true';
  const { rows } = await pool.query(
    `SELECT *, COUNT(*) OVER() AS total FROM plans
     WHERE ($1::boolean = false
        OR ((available_from IS NULL OR available_from <= CURRENT_DATE)
        AND (available_to IS NULL OR available_to >= CURRENT_DATE)))
     ORDER BY id DESC LIMIT $2 OFFSET $3`, [onlyOpen, limit, offset]);
  res.json({ page, limit, total: rows[0] ? Number(rows[0].total) : 0,
             items: rows.map(({ total, ...r }) => r) });
}));

router.get('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM plans WHERE id=$1', [req.params.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Plan not found' });
}));

router.post('/', ...admin, wrap(async (req, res) => {
  const { error, value } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    `INSERT INTO plans (name,price,period,min_quantity,available_from,available_to,auto_close,closable,pausable,renewable)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, value);
  res.status(201).json(rows[0]);
}));

router.put('/:id', ...admin, wrap(async (req, res) => {
  const { error, value } = clean(req.body);
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    `UPDATE plans SET name=$1,price=$2,period=$3,min_quantity=$4,available_from=$5,available_to=$6,
       auto_close=$7,closable=$8,pausable=$9,renewable=$10 WHERE id=$11 RETURNING *`, [...value, req.params.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Plan not found' });
}));

// Fails with 409 if subscriptions already use the plan (foreign key)
router.delete('/:id', ...admin, wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM plans WHERE id=$1', [req.params.id]);
  rowCount ? res.json({ message: 'Plan removed' }) : res.status(404).json({ error: 'Plan not found' });
}));

module.exports = router;
