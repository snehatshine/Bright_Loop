const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, paging, isNum } = require('../services/http');

const staffOrAdmin = [requireAuth, requireRole('admin', 'staff')];
const adminOnly = [requireAuth, requireRole('admin')];

// GET / - List quotation templates (paginated, admin/staff)
router.get('/', ...staffOrAdmin, wrap(async (req, res) => {
  const { limit, offset, page } = paging(req);
  const { rows } = await pool.query(
    `SELECT t.*, p.name AS plan_name, COUNT(*) OVER() AS total
     FROM quotation_templates t
     JOIN plans p ON t.plan_id = p.id
     ORDER BY t.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  res.json({
    page,
    limit,
    total: rows[0] ? Number(rows[0].total) : 0,
    items: rows.map(({ total, ...r }) => r)
  });
}));

// GET /:id - Get quotation template with its lines (admin/staff)
router.get('/:id', ...staffOrAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, p.name AS plan_name,
       COALESCE(
         (SELECT json_agg(
           json_build_object(
             'id', l.id,
             'product_id', l.product_id,
             'product_name', pr.name,
             'variant_id', l.variant_id,
             'variant_value', v.value,
             'quantity', l.quantity
           ) ORDER BY l.id
         )
         FROM quotation_template_lines l
         JOIN products pr ON pr.id = l.product_id
         LEFT JOIN variants v ON v.id = l.variant_id
         WHERE l.template_id = t.id),
         '[]'
       ) AS lines
     FROM quotation_templates t
     JOIN plans p ON t.plan_id = p.id
     WHERE t.id = $1`,
    [req.params.id]
  );

  rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Template not found' });
}));

// POST / - Create quotation template and lines in ONE transaction (admin/staff)
router.post('/', ...staffOrAdmin, wrap(async (req, res) => {
  const { name, plan_id, validity_days, lines = [] } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Template name is required' });
  }
  if (!isNum(plan_id)) {
    return res.status(400).json({ error: 'Valid plan_id is required' });
  }
  const days = Number(validity_days);
  if (!Number.isInteger(days) || days <= 0) {
    return res.status(400).json({ error: 'validity_days must be an integer greater than 0' });
  }
  if (!Array.isArray(lines)) {
    return res.status(400).json({ error: 'lines must be an array' });
  }

  // Validate plan exists
  const planCheck = await pool.query('SELECT id FROM plans WHERE id = $1', [plan_id]);
  if (!planCheck.rows[0]) {
    return res.status(400).json({ error: 'Plan not found' });
  }

  // Validate lines
  for (const [idx, line] of lines.entries()) {
    if (!line || !isNum(line.product_id)) {
      return res.status(400).json({ error: `Line ${idx + 1}: valid product_id is required` });
    }
    const qty = line.quantity === undefined ? 1 : Number(line.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: `Line ${idx + 1}: quantity must be an integer greater than 0` });
    }

    const prodRes = await pool.query('SELECT id, active FROM products WHERE id = $1', [line.product_id]);
    if (!prodRes.rows[0] || !prodRes.rows[0].active) {
      return res.status(400).json({ error: `Line ${idx + 1}: product not found or inactive` });
    }

    if (line.variant_id !== undefined && line.variant_id !== null) {
      if (!isNum(line.variant_id)) {
        return res.status(400).json({ error: `Line ${idx + 1}: invalid variant_id` });
      }
      const varRes = await pool.query(
        'SELECT id, product_id FROM variants WHERE id = $1',
        [line.variant_id]
      );
      if (!varRes.rows[0]) {
        return res.status(400).json({ error: `Line ${idx + 1}: variant not found` });
      }
      if (String(varRes.rows[0].product_id) !== String(line.product_id)) {
        return res.status(400).json({ error: `Line ${idx + 1}: variant does not belong to specified product` });
      }
    }
  }

  // Create template and lines in ONE transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tmplRes = await client.query(
      `INSERT INTO quotation_templates (name, plan_id, validity_days)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), plan_id, days]
    );
    const template = tmplRes.rows[0];

    const insertedLines = [];
    for (const line of lines) {
      const qty = line.quantity === undefined ? 1 : Number(line.quantity);
      const lineRes = await client.query(
        `INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [template.id, line.product_id, line.variant_id || null, qty]
      );
      insertedLines.push(lineRes.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ ...template, lines: insertedLines });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// DELETE /:id - Delete quotation template (admin only)
router.delete('/:id', ...adminOnly, wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM quotation_templates WHERE id = $1', [req.params.id]);
  rowCount ? res.json({ message: 'Template removed' }) : res.status(404).json({ error: 'Template not found' });
}));

module.exports = router;
