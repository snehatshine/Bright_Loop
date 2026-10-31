const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, paging, isNum } = require('../services/http');

const admin = [requireAuth, requireRole('admin')];

function validate(b) {
  if (!b.name || !b.type) return 'Name and type are required';
  if (!isNum(b.sales_price) || Number(b.sales_price) < 0) return 'Sales price must be 0 or more';
  if (b.cost_price !== undefined && (!isNum(b.cost_price) || Number(b.cost_price) < 0)) return 'Cost price must be 0 or more';
  return null;
}

// List products with their variants (anyone logged in)
router.get('/', requireAuth, wrap(async (req, res) => {
  const { limit, offset, page } = paging(req);
  const q = `%${req.query.q || ''}%`;
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE(
        (SELECT json_agg(v ORDER BY v.id) FROM variants v WHERE v.product_id = p.id), '[]') AS variants,
        COUNT(*) OVER() AS total
     FROM products p
     WHERE p.active AND p.name ILIKE $1
     ORDER BY p.id DESC LIMIT $2 OFFSET $3`, [q, limit, offset]);
  res.json({ page, limit, total: rows[0] ? Number(rows[0].total) : 0,
             items: rows.map(({ total, ...r }) => r) });
}));

router.get('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE((SELECT json_agg(v ORDER BY v.id) FROM variants v WHERE v.product_id = p.id), '[]') AS variants
     FROM products p WHERE p.id = $1`, [req.params.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Product not found' });
}));

router.post('/', ...admin, wrap(async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, type, sales_price, cost_price = 0, notes = null } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO products (name,type,sales_price,cost_price,notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, type, sales_price, cost_price, notes]);
  res.status(201).json(rows[0]);
}));

router.put('/:id', ...admin, wrap(async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const { name, type, sales_price, cost_price = 0, notes = null } = req.body;
  const { rows } = await pool.query(
    `UPDATE products SET name=$1,type=$2,sales_price=$3,cost_price=$4,notes=$5 WHERE id=$6 RETURNING *`,
    [name, type, sales_price, cost_price, notes, req.params.id]);
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Product not found' });
}));

// Soft delete: products may already be used on subscription lines
router.delete('/:id', ...admin, wrap(async (req, res) => {
  const { rowCount } = await pool.query('UPDATE products SET active=false WHERE id=$1', [req.params.id]);
  rowCount ? res.json({ message: 'Product removed' }) : res.status(404).json({ error: 'Product not found' });
}));

// Variants, e.g. attribute "brand", value "Odoo", extra_price 560
router.post('/:id/variants', ...admin, wrap(async (req, res) => {
  const { attribute, value, extra_price = 0 } = req.body;
  if (!attribute || !value) return res.status(400).json({ error: 'Attribute and value are required' });
  if (!isNum(extra_price)) return res.status(400).json({ error: 'Extra price must be a number' });
  const { rows } = await pool.query(
    `INSERT INTO variants (product_id,attribute,value,extra_price) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.id, attribute, value, extra_price]);
  res.status(201).json(rows[0]);
}));

router.delete('/:id/variants/:variantId', ...admin, wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM variants WHERE id=$1 AND product_id=$2',
    [req.params.variantId, req.params.id]);
  rowCount ? res.json({ message: 'Variant removed' }) : res.status(404).json({ error: 'Variant not found' });
}));

module.exports = router;
