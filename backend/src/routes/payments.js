const router = require('express').Router();
const pg = require('pg');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, paging, isNum } = require('../services/http');
const { toCents, fromCents } = require('../services/billing');

pg.types.setTypeParser(1082, str => str);

const staffOrAdmin = [requireAuth, requireRole('admin', 'staff')];

// POST / - Record a payment (admin, staff)
router.post('/', ...staffOrAdmin, wrap(async (req, res) => {
  const { invoice_id, method, amount, paid_on, note } = req.body;

  if (!isNum(invoice_id)) {
    return res.status(400).json({ error: 'Valid invoice_id is required' });
  }
  if (!method || typeof method !== 'string' || !method.trim()) {
    return res.status(400).json({ error: 'Payment method is required' });
  }
  if (!isNum(amount) || toCents(amount) <= 0) {
    return res.status(400).json({ error: 'Payment amount must be greater than 0' });
  }

  const paymentDate = paid_on && !isNaN(Date.parse(paid_on))
    ? paid_on
    : new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the invoice FOR UPDATE
    const { rows: invRows } = await client.query(
      'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
      [invoice_id]
    );

    const inv = invRows[0];
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Must be 'confirmed' (400 for draft, cancelled or paid)
    if (inv.status !== 'confirmed') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot record payment for invoice with status '${inv.status}'. Invoice must be in 'confirmed' status.`
      });
    }

    const totalCents = toCents(inv.total);
    const amountPaidCents = toCents(inv.amount_paid);
    const balanceCents = Math.max(0, totalCents - amountPaidCents);
    const paymentCents = toCents(amount);

    // amount <= remaining balance (400 otherwise, no overpayment)
    if (paymentCents > balanceCents) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Payment amount of $${fromCents(paymentCents)} exceeds remaining balance of $${fromCents(balanceCents)}`
      });
    }

    // Insert payment
    const { rows: payRows } = await client.query(
      `INSERT INTO payments (invoice_id, method, amount, paid_on, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        invoice_id,
        method.trim(),
        fromCents(paymentCents),
        paymentDate,
        note ? String(note).trim() : null,
        req.user.id
      ]
    );

    // Add to amount_paid, and if amount_paid >= total set status = 'paid'. Partial payments leave it 'confirmed'.
    const newAmountPaidCents = amountPaidCents + paymentCents;
    const newStatus = newAmountPaidCents >= totalCents ? 'paid' : 'confirmed';

    await client.query(
      'UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3',
      [fromCents(newAmountPaidCents), newStatus, invoice_id]
    );

    await client.query('COMMIT');

    const payment = payRows[0];
    res.status(201).json({
      payment,
      invoice: {
        id: inv.id,
        status: newStatus,
        amount_paid: fromCents(newAmountPaidCents),
        balance: fromCents(Math.max(0, totalCents - newAmountPaidCents))
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// GET / - List payments (paginated, with filters)
router.get('/', requireAuth, wrap(async (req, res) => {
  const { limit, offset, page } = paging(req);
  const isCustomer = req.user.role === 'customer';
  const conditions = [];
  const params = [];

  // Customers see only payments of their own invoices
  if (isCustomer) {
    params.push(req.user.id);
    conditions.push(`i.customer_id = $${params.length}`);
  }

  if (req.query.invoice_id && isNum(req.query.invoice_id)) {
    params.push(req.query.invoice_id);
    conditions.push(`p.invoice_id = $${params.length}`);
  }

  if (req.query.method) {
    params.push(req.query.method);
    conditions.push(`p.method = $${params.length}`);
  }

  if (req.query.from) {
    params.push(req.query.from);
    conditions.push(`p.paid_on >= $${params.length}`);
  }

  if (req.query.to) {
    params.push(req.query.to);
    conditions.push(`p.paid_on <= $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const query = `
    SELECT p.*, i.number AS invoice_number, i.customer_id, COUNT(*) OVER() AS total
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    ${whereClause}
    ORDER BY p.id DESC
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

// GET /:id - Single payment
router.get('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, i.number AS invoice_number, i.customer_id
     FROM payments p
     JOIN invoices i ON p.invoice_id = i.id
     WHERE p.id = $1`,
    [req.params.id]
  );

  const payment = rows[0];
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  // Customer access control: 404 for anyone else's
  if (req.user.role === 'customer' && String(payment.customer_id) !== String(req.user.id)) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  res.json(payment);
}));

module.exports = router;
