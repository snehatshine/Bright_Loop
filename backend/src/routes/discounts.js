const router = require('express').Router();
const pg = require('pg');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, paging, isNum } = require('../services/http');

pg.types.setTypeParser(1082, str => str);

const adminOnly = [requireAuth, requireRole('admin')];
const staffOrAdmin = [requireAuth, requireRole('admin', 'staff')];

const DISCOUNT_TYPES = ['fixed', 'percentage'];
const DISCOUNT_SCOPES = ['product', 'subscription'];

function validateDiscount(b) {
  if (!b.name || typeof b.name !== 'string' || !b.name.trim()) {
    return { error: 'Discount name is required' };
  }
  if (!DISCOUNT_TYPES.includes(b.type)) {
    return { error: "Discount type must be 'fixed' or 'percentage'" };
  }
  if (!isNum(b.value) || Number(b.value) <= 0) {
    return { error: 'Discount value must be greater than 0' };
  }
  if (b.type === 'percentage' && Number(b.value) > 100) {
    return { error: 'Percentage discount cannot exceed 100' };
  }
  if (!DISCOUNT_SCOPES.includes(b.scope)) {
    return { error: "Discount scope must be 'product' or 'subscription'" };
  }
  if (b.scope === 'product') {
    if (!isNum(b.product_id)) {
      return { error: "product_id is required when scope is 'product'" };
    }
  }

  const minPurchase = b.min_purchase === undefined || b.min_purchase === null || b.min_purchase === ''
    ? 0
    : Number(b.min_purchase);
  if (!isNum(minPurchase) || minPurchase < 0) {
    return { error: 'min_purchase must be 0 or more' };
  }

  const minQuantity = b.min_quantity === undefined || b.min_quantity === null || b.min_quantity === ''
    ? 0
    : Number(b.min_quantity);
  if (!Number.isInteger(minQuantity) || minQuantity < 0) {
    return { error: 'min_quantity must be an integer 0 or more' };
  }

  if (!b.start_date || isNaN(Date.parse(b.start_date))) {
    return { error: 'Valid start_date (YYYY-MM-DD) is required' };
  }
  if (!b.end_date || isNaN(Date.parse(b.end_date))) {
    return { error: 'Valid end_date (YYYY-MM-DD) is required' };
  }
  if (b.end_date < b.start_date) {
    return { error: 'end_date must be on or after start_date' };
  }

  let usageLimit = null;
  if (b.usage_limit !== undefined && b.usage_limit !== null && b.usage_limit !== '') {
    usageLimit = Number(b.usage_limit);
    if (!Number.isInteger(usageLimit) || usageLimit <= 0) {
      return { error: 'usage_limit must be a positive integer or null' };
    }
  }

  const productId = b.scope === 'product' ? b.product_id : null;

  return {
    value: [
      b.name.trim(),
      b.type,
      b.value,
      b.scope,
      productId,
      minPurchase,
      minQuantity,
      b.start_date,
      b.end_date,
      usageLimit
    ]
  };
}

// GET / - List discounts (admin, staff)
router.get('/', ...staffOrAdmin, wrap(async (req, res) => {
  const { limit, offset, page } = paging(req);
  const conditions = [];
  const params = [];

  if (req.query.scope && DISCOUNT_SCOPES.includes(req.query.scope)) {
    params.push(req.query.scope);
    conditions.push(`d.scope = $${params.length}`);
  }

  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    conditions.push(`d.name ILIKE $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const query = `
    SELECT d.*, p.name AS product_name, COUNT(*) OVER() AS total
    FROM discounts d
    LEFT JOIN products p ON d.product_id = p.id
    ${whereClause}
    ORDER BY d.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query(query, params);
  res.json({
    page,
    limit,
    total: rows[0] ? Number(rows[0].total) : 0,
    items: rows.map(({ total, ...r }) => r)
  });
}));

// GET /:id - Single discount (admin, staff)
router.get('/:id', ...staffOrAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, p.name AS product_name
     FROM discounts d
     LEFT JOIN products p ON d.product_id = p.id
     WHERE d.id = $1`,
    [req.params.id]
  );
  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Discount not found' });
}));

// POST / - Create discount (admin only)
router.post('/', ...adminOnly, wrap(async (req, res) => {
  const { error, value } = validateDiscount(req.body);
  if (error) return res.status(400).json({ error });

  if (value[3] === 'product') {
    const prod = await pool.query('SELECT id FROM products WHERE id = $1', [value[4]]);
    if (!prod.rows[0]) {
      return res.status(400).json({ error: 'Product not found' });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO discounts (name, type, value, scope, product_id, min_purchase, min_quantity, start_date, end_date, usage_limit, times_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)
     RETURNING *`,
    value
  );
  res.status(201).json(rows[0]);
}));

// PUT /:id - Update discount (admin only)
router.put('/:id', ...adminOnly, wrap(async (req, res) => {
  const existing = await pool.query('SELECT * FROM discounts WHERE id = $1', [req.params.id]);
  if (!existing.rows[0]) {
    return res.status(404).json({ error: 'Discount not found' });
  }

  // Check if discount was already used on an invoice line
  const usedCheck = await pool.query('SELECT 1 FROM invoice_lines WHERE discount_id = $1 LIMIT 1', [req.params.id]);
  if (usedCheck.rows[0]) {
    return res.status(409).json({ error: 'Cannot modify a discount that has already been used on an invoice' });
  }

  const { error, value } = validateDiscount(req.body);
  if (error) return res.status(400).json({ error });

  if (value[3] === 'product') {
    const prod = await pool.query('SELECT id FROM products WHERE id = $1', [value[4]]);
    if (!prod.rows[0]) {
      return res.status(400).json({ error: 'Product not found' });
    }
  }

  const { rows } = await pool.query(
    `UPDATE discounts
     SET name = $1, type = $2, value = $3, scope = $4, product_id = $5,
         min_purchase = $6, min_quantity = $7, start_date = $8, end_date = $9, usage_limit = $10
     WHERE id = $11
     RETURNING *`,
    [...value, req.params.id]
  );
  res.json(rows[0]);
}));

// DELETE /:id - Delete discount (admin only)
router.delete('/:id', ...adminOnly, wrap(async (req, res) => {
  const existing = await pool.query('SELECT * FROM discounts WHERE id = $1', [req.params.id]);
  if (!existing.rows[0]) {
    return res.status(404).json({ error: 'Discount not found' });
  }

  const usedCheck = await pool.query('SELECT 1 FROM invoice_lines WHERE discount_id = $1 LIMIT 1', [req.params.id]);
  if (usedCheck.rows[0]) {
    return res.status(409).json({ error: 'Cannot delete a discount that has already been used on an invoice' });
  }

  await pool.query('DELETE FROM discounts WHERE id = $1', [req.params.id]);
  res.json({ message: 'Discount removed' });
}));

module.exports = router;
