const router = require('express').Router();
const pg = require('pg');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, paging, isNum } = require('../services/http');
const {
  validateTransition,
  runAutoClose,
  PERIOD_INTERVALS
} = require('../services/subscriptionRules');

// Return DATE columns as 'YYYY-MM-DD' strings instead of UTC-shifted Date objects
pg.types.setTypeParser(1082, str => str);

const staffOrAdmin = [requireAuth, requireRole('admin', 'staff')];
const adminOnly = [requireAuth, requireRole('admin')];

// GET / - List subscriptions (paginated, with status/customer_id/q filters)
router.get('/', requireAuth, wrap(async (req, res) => {
  const { limit, offset, page } = paging(req);
  const isCustomer = req.user.role === 'customer';

  const conditions = [];
  const params = [];

  // Role constraint: Customer only sees their own
  if (isCustomer) {
    params.push(req.user.id);
    conditions.push(`s.customer_id = $${params.length}`);
  } else if (req.query.customer_id && isNum(req.query.customer_id)) {
    params.push(req.query.customer_id);
    conditions.push(`s.customer_id = $${params.length}`);
  }

  // Status filter
  if (req.query.status) {
    params.push(req.query.status);
    conditions.push(`s.status = $${params.length}::sub_status`);
  }

  // q search by number
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    conditions.push(`s.number ILIKE $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const query = `
    SELECT s.*, p.name AS plan_name, u.name AS customer_name, COUNT(*) OVER() AS total
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    JOIN users u ON s.customer_id = u.id
    ${whereClause}
    ORDER BY s.id DESC
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

// POST /run-auto-close - Admin only trigger to auto-close expired subscriptions
router.post('/run-auto-close', ...adminOnly, wrap(async (req, res) => {
  const { closedCount } = await runAutoClose(pool);
  res.json({ closed: closedCount });
}));

// GET /:id - Retrieve single subscription with lines, plan name, customer name
router.get('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, p.name AS plan_name, u.name AS customer_name,
       COALESCE(
         (SELECT json_agg(
           json_build_object(
             'id', l.id,
             'product_id', l.product_id,
             'product_name', pr.name,
             'variant_id', l.variant_id,
             'variant_value', v.value,
             'quantity', l.quantity,
             'unit_price', l.unit_price,
             'tax_id', l.tax_id,
             'tax_name', tx.name,
             'tax_rate', tx.rate_percent,
             'amount', l.amount
           ) ORDER BY l.id
         )
         FROM subscription_lines l
         JOIN products pr ON pr.id = l.product_id
         LEFT JOIN variants v ON v.id = l.variant_id
         LEFT JOIN taxes tx ON tx.id = l.tax_id
         WHERE l.subscription_id = s.id),
         '[]'
       ) AS lines
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     JOIN users u ON s.customer_id = u.id
     WHERE s.id = $1`,
    [req.params.id]
  );

  const sub = rows[0];
  if (!sub) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  // Customer role security: return 404 if reading others' subscriptions
  if (req.user.role === 'customer' && String(sub.customer_id) !== String(req.user.id)) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  res.json(sub);
}));

// POST / - Create a subscription (admin/staff only)
router.post('/', ...staffOrAdmin, wrap(async (req, res) => {
  const {
    customer_id,
    plan_id,
    template_id,
    start_date,
    expiry_date,
    payment_terms_days = 15,
    lines: reqLines
  } = req.body;

  if (!isNum(customer_id)) {
    return res.status(400).json({ error: 'Valid customer_id is required' });
  }
  if (!isNum(plan_id)) {
    return res.status(400).json({ error: 'Valid plan_id is required' });
  }
  if (!start_date || isNaN(Date.parse(start_date))) {
    return res.status(400).json({ error: 'Valid start_date (YYYY-MM-DD) is required' });
  }
  if (!isNum(payment_terms_days) || Number(payment_terms_days) < 0) {
    return res.status(400).json({ error: 'payment_terms_days must be 0 or more' });
  }

  // Verify customer exists and has role 'customer'
  const userCheck = await pool.query('SELECT id, role FROM users WHERE id = $1', [customer_id]);
  if (!userCheck.rows[0] || userCheck.rows[0].role !== 'customer') {
    return res.status(400).json({ error: 'Customer not found or user is not a customer' });
  }

  // Verify plan exists
  const planCheck = await pool.query('SELECT * FROM plans WHERE id = $1', [plan_id]);
  const plan = planCheck.rows[0];
  if (!plan) {
    return res.status(400).json({ error: 'Plan not found' });
  }

  // Validate plan availability on start_date
  const startDateStr = new Date(start_date).toISOString().slice(0, 10);
  if (plan.available_from) {
    const fromStr = new Date(plan.available_from).toISOString().slice(0, 10);
    if (startDateStr < fromStr) {
      return res.status(400).json({ error: 'Plan is not available on start_date (before available_from)' });
    }
  }
  if (plan.available_to) {
    const toStr = new Date(plan.available_to).toISOString().slice(0, 10);
    if (startDateStr > toStr) {
      return res.status(400).json({ error: 'Plan is not available on start_date (after available_to)' });
    }
  }

  // Resolve lines: if empty and template_id given, copy template lines
  let linesToInsert = Array.isArray(reqLines) && reqLines.length > 0 ? reqLines : [];
  if (linesToInsert.length === 0 && template_id) {
    if (!isNum(template_id)) {
      return res.status(400).json({ error: 'Invalid template_id' });
    }
    const tmplCheck = await pool.query('SELECT id FROM quotation_templates WHERE id = $1', [template_id]);
    if (!tmplCheck.rows[0]) {
      return res.status(400).json({ error: 'Template not found' });
    }
    const tmplLines = await pool.query(
      'SELECT product_id, variant_id, quantity FROM quotation_template_lines WHERE template_id = $1 ORDER BY id',
      [template_id]
    );
    linesToInsert = tmplLines.rows;
  }

  if (linesToInsert.length === 0) {
    return res.status(400).json({ error: 'Subscription must contain at least one line (or provide a template with lines)' });
  }

  // Validate every line and calculate pricing
  const minQty = plan.min_quantity || 1;
  const processedLines = [];

  for (const [idx, line] of linesToInsert.entries()) {
    if (!line || !isNum(line.product_id)) {
      return res.status(400).json({ error: `Line ${idx + 1}: valid product_id is required` });
    }
    const qty = Number(line.quantity || 1);
    if (!Number.isInteger(qty) || qty < minQty) {
      return res.status(400).json({
        error: `Line ${idx + 1}: quantity must be at least the plan's minimum quantity (${minQty})`
      });
    }

    // Product lookup
    const prodRes = await pool.query('SELECT id, sales_price, active FROM products WHERE id = $1', [line.product_id]);
    const prod = prodRes.rows[0];
    if (!prod || !prod.active) {
      return res.status(400).json({ error: `Line ${idx + 1}: product not found or inactive` });
    }

    let extraPrice = 0;
    if (line.variant_id !== undefined && line.variant_id !== null) {
      if (!isNum(line.variant_id)) {
        return res.status(400).json({ error: `Line ${idx + 1}: invalid variant_id` });
      }
      const varRes = await pool.query(
        'SELECT id, product_id, extra_price FROM variants WHERE id = $1',
        [line.variant_id]
      );
      const variant = varRes.rows[0];
      if (!variant) {
        return res.status(400).json({ error: `Line ${idx + 1}: variant not found` });
      }
      if (String(variant.product_id) !== String(line.product_id)) {
        return res.status(400).json({ error: `Line ${idx + 1}: variant does not belong to specified product` });
      }
      extraPrice = Number(variant.extra_price || 0);
    }

    // Tax lookup (optional)
    if (line.tax_id !== undefined && line.tax_id !== null) {
      if (!isNum(line.tax_id)) {
        return res.status(400).json({ error: `Line ${idx + 1}: invalid tax_id` });
      }
      const taxRes = await pool.query('SELECT id, active FROM taxes WHERE id = $1', [line.tax_id]);
      if (!taxRes.rows[0] || !taxRes.rows[0].active) {
        return res.status(400).json({ error: `Line ${idx + 1}: tax not found or inactive` });
      }
    }

    const unitPrice = Number(prod.sales_price) + extraPrice;
    const amount = Number((qty * unitPrice).toFixed(2));

    processedLines.push({
      product_id: line.product_id,
      variant_id: line.variant_id || null,
      quantity: qty,
      unit_price: unitPrice,
      tax_id: line.tax_id || null,
      amount
    });
  }

  // Insert subscription and lines in ONE transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subRes = await client.query(
      `INSERT INTO subscriptions (
         customer_id, plan_id, template_id, status, start_date, expiry_date, payment_terms_days, created_by
       ) VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7)
       RETURNING *`,
      [
        customer_id,
        plan_id,
        template_id || null,
        startDateStr,
        expiry_date || null,
        payment_terms_days,
        req.user.id
      ]
    );
    const subscription = subRes.rows[0];

    const insertedLines = [];
    for (const pl of processedLines) {
      const lineRes = await client.query(
        `INSERT INTO subscription_lines (
           subscription_id, product_id, variant_id, quantity, unit_price, tax_id, amount
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [subscription.id, pl.product_id, pl.variant_id, pl.quantity, pl.unit_price, pl.tax_id, pl.amount]
      );
      insertedLines.push(lineRes.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ ...subscription, lines: insertedLines });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// POST /:id/transition - Forward-only state transition (admin/staff)
router.post('/:id/transition', ...staffOrAdmin, wrap(async (req, res) => {
  const { to } = req.body;
  if (!to) {
    return res.status(400).json({ error: "Missing required 'to' status in request body" });
  }

  const { rows } = await pool.query(
    `SELECT s.*, p.closable
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.id = $1`,
    [req.params.id]
  );
  const sub = rows[0];
  if (!sub) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  const check = validateTransition(sub.status, to, { closable: sub.closable }, sub);
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  let updated;
  if (to === 'active') {
    // When moving to 'active', set next_invoice_date = start_date
    const updRes = await pool.query(
      `UPDATE subscriptions
       SET status = 'active', next_invoice_date = start_date
       WHERE id = $1
       RETURNING *`,
      [sub.id]
    );
    updated = updRes.rows[0];
  } else {
    const updRes = await pool.query(
      `UPDATE subscriptions
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [to, sub.id]
    );
    updated = updRes.rows[0];
  }

  res.json(updated);
}));

// POST /:id/pause - Pause active subscription (admin/staff)
router.post('/:id/pause', ...staffOrAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, p.pausable
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.id = $1`,
    [req.params.id]
  );
  const sub = rows[0];
  if (!sub) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  if (sub.status !== 'active') {
    return res.status(400).json({ error: 'Only active subscriptions can be paused' });
  }
  if (!sub.pausable) {
    return res.status(400).json({ error: 'Subscription plan is not pausable' });
  }

  const updRes = await pool.query(
    `UPDATE subscriptions SET paused = true WHERE id = $1 RETURNING *`,
    [sub.id]
  );
  res.json(updRes.rows[0]);
}));

// POST /:id/resume - Resume active subscription (admin/staff)
router.post('/:id/resume', ...staffOrAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, p.pausable
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.id = $1`,
    [req.params.id]
  );
  const sub = rows[0];
  if (!sub) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  if (sub.status !== 'active') {
    return res.status(400).json({ error: 'Only active subscriptions can be resumed' });
  }
  if (!sub.pausable) {
    return res.status(400).json({ error: 'Subscription plan is not pausable' });
  }

  const updRes = await pool.query(
    `UPDATE subscriptions SET paused = false WHERE id = $1 RETURNING *`,
    [sub.id]
  );
  res.json(updRes.rows[0]);
}));

// POST /:id/renew - Extend expiry_date by one plan period (admin/staff)
router.post('/:id/renew', ...staffOrAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, p.renewable, p.period
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.id = $1`,
    [req.params.id]
  );
  const sub = rows[0];
  if (!sub) {
    return res.status(404).json({ error: 'Subscription not found' });
  }
  if (sub.status !== 'active') {
    return res.status(400).json({ error: 'Only active subscriptions can be renewed' });
  }
  if (!sub.renewable) {
    return res.status(400).json({ error: 'Subscription plan is not renewable' });
  }

  const interval = PERIOD_INTERVALS[sub.period];
  if (!interval) {
    return res.status(400).json({ error: `Unsupported plan billing period: ${sub.period}` });
  }

  const updRes = await pool.query(
    `UPDATE subscriptions
     SET expiry_date = (GREATEST(COALESCE(expiry_date, CURRENT_DATE), CURRENT_DATE) + ($1)::interval)::date
     WHERE id = $2
     RETURNING *`,
    [interval, sub.id]
  );
  res.json(updRes.rows[0]);
}));

module.exports = router;
