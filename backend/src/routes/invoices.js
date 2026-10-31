const router = require('express').Router();
const pg = require('pg');
const nodemailer = require('nodemailer');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, paging, isNum } = require('../services/http');
const { generateDueInvoices, toCents, fromCents } = require('../services/billing');

pg.types.setTypeParser(1082, str => str);

const staffOrAdmin = [requireAuth, requireRole('admin', 'staff')];

async function sendMail(to, subject, text) {
  if (!process.env.SMTP_HOST) {
    return console.log(`[DEV EMAIL] to=${to}\nSubject: ${subject}\n\n${text}`);
  }
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +process.env.SMTP_PORT,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await t.sendMail({ from: process.env.SMTP_USER, to, subject, text });
}

function enrichInvoice(inv) {
  const today = new Date().toISOString().slice(0, 10);
  const totalCents = toCents(inv.total);
  const paidCents = toCents(inv.amount_paid);
  const balanceCents = Math.max(0, totalCents - paidCents);
  const overdue = inv.status === 'confirmed' && inv.due_date < today && paidCents < totalCents;

  return {
    ...inv,
    balance: fromCents(balanceCents),
    overdue
  };
}

// POST /generate - Run billing job (admin, staff)
router.post('/generate', ...staffOrAdmin, wrap(async (req, res) => {
  const today = req.body?.today || new Date().toISOString().slice(0, 10);
  const summary = await generateDueInvoices({ today });
  res.json(summary);
}));

// GET / - List invoices (paginated with filters)
router.get('/', requireAuth, wrap(async (req, res) => {
  const { limit, offset, page } = paging(req);
  const isCustomer = req.user.role === 'customer';
  const conditions = [];
  const params = [];

  // Customer role restriction
  if (isCustomer) {
    params.push(req.user.id);
    conditions.push(`i.customer_id = $${params.length}`);
  } else if (req.query.customer_id && isNum(req.query.customer_id)) {
    params.push(req.query.customer_id);
    conditions.push(`i.customer_id = $${params.length}`);
  }

  if (req.query.status) {
    params.push(req.query.status);
    conditions.push(`i.status = $${params.length}::invoice_status`);
  }

  if (req.query.subscription_id && isNum(req.query.subscription_id)) {
    params.push(req.query.subscription_id);
    conditions.push(`i.subscription_id = $${params.length}`);
  }

  if (req.query.overdue === 'true') {
    conditions.push(`i.status = 'confirmed' AND i.due_date < CURRENT_DATE AND i.amount_paid < i.total`);
  }

  if (req.query.from) {
    params.push(req.query.from);
    conditions.push(`i.period_start >= $${params.length}`);
  }

  if (req.query.to) {
    params.push(req.query.to);
    conditions.push(`i.period_start <= $${params.length}`);
  }

  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    conditions.push(`i.number ILIKE $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const query = `
    SELECT i.*, u.name AS customer_name, u.email AS customer_email, COUNT(*) OVER() AS total
    FROM invoices i
    JOIN users u ON i.customer_id = u.id
    ${whereClause}
    ORDER BY i.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query(query, params);
  res.json({
    page,
    limit,
    total: rows[0] ? Number(rows[0].total) : 0,
    items: rows.map(({ total, ...r }) => enrichInvoice(r))
  });
}));

// GET /:id - Single invoice with lines and payments
router.get('/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, u.name AS customer_name, u.email AS customer_email,
       COALESCE(
         (SELECT json_agg(
           json_build_object(
             'id', l.id,
             'description', l.description,
             'quantity', l.quantity,
             'unit_price', l.unit_price,
             'discount_id', l.discount_id,
             'tax_percent', l.tax_percent,
             'amount', l.amount
           ) ORDER BY l.id
         ) FROM invoice_lines l WHERE l.invoice_id = i.id),
         '[]'
       ) AS lines,
       COALESCE(
         (SELECT json_agg(
           json_build_object(
             'id', p.id,
             'method', p.method,
             'amount', p.amount,
             'paid_on', p.paid_on,
             'note', p.note
           ) ORDER BY p.id
         ) FROM payments p WHERE p.invoice_id = i.id),
         '[]'
       ) AS payments
     FROM invoices i
     JOIN users u ON i.customer_id = u.id
     WHERE i.id = $1`,
    [req.params.id]
  );

  const inv = rows[0];
  if (!inv) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  if (req.user.role === 'customer' && String(inv.customer_id) !== String(req.user.id)) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  res.json(enrichInvoice(inv));
}));

// POST /:id/confirm - Confirm draft invoice (admin, staff)
router.post('/:id/confirm', ...staffOrAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });

  if (inv.status !== 'draft') {
    return res.status(400).json({
      error: `Cannot confirm invoice with status '${inv.status}'. Only draft invoices can be confirmed.`
    });
  }

  const updated = await pool.query(
    `UPDATE invoices SET status = 'confirmed' WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  res.json(enrichInvoice(updated.rows[0]));
}));

// POST /:id/cancel - Cancel invoice (admin, staff)
router.post('/:id/cancel', ...staffOrAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });

  if (inv.status !== 'draft' && inv.status !== 'confirmed') {
    return res.status(400).json({
      error: `Cannot cancel invoice with status '${inv.status}'. Only draft or confirmed invoices can be cancelled.`
    });
  }

  if (inv.status === 'confirmed') {
    const payCheck = await pool.query('SELECT 1 FROM payments WHERE invoice_id = $1 LIMIT 1', [inv.id]);
    if (payCheck.rows[0] || toCents(inv.amount_paid) > 0) {
      return res.status(400).json({
        error: 'Cannot cancel a confirmed invoice that has recorded payments.'
      });
    }
  }

  const updated = await pool.query(
    `UPDATE invoices SET status = 'cancelled' WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  res.json(enrichInvoice(updated.rows[0]));
}));

// POST /:id/send - Email invoice to customer (admin, staff)
router.post('/:id/send', ...staffOrAdmin, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, u.name AS customer_name, u.email AS customer_email
     FROM invoices i
     JOIN users u ON i.customer_id = u.id
     WHERE i.id = $1`,
    [req.params.id]
  );
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });

  if (inv.status !== 'confirmed' && inv.status !== 'paid') {
    return res.status(400).json({
      error: `Cannot send invoice with status '${inv.status}'. Only confirmed or paid invoices can be sent.`
    });
  }

  const enriched = enrichInvoice(inv);
  const subject = `Brightloop Invoice ${inv.number}`;
  const text = `Dear ${inv.customer_name},

Thank you for being a customer of Brightloop Software.
Please find the summary of your invoice below:

Invoice Number: ${inv.number}
Billing Period: ${inv.period_start} to ${inv.period_end}
Subtotal: $${inv.subtotal}
Discounts: $${inv.discount_total}
Tax: $${inv.tax_total}
Total Amount: $${inv.total}
Amount Paid: $${inv.amount_paid}
Remaining Balance: $${enriched.balance}
Due Date: ${inv.due_date}
Status: ${inv.status}

Best regards,
Brightloop Software Team`;

  await sendMail(inv.customer_email, subject, text);
  res.json({ message: `Invoice sent successfully to ${inv.customer_email}` });
}));

// GET /:id/print - Clean, printable HTML invoice page
router.get('/:id/print', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.*, u.name AS customer_name, u.email AS customer_email,
       COALESCE(
         (SELECT json_agg(
           json_build_object(
             'id', l.id,
             'description', l.description,
             'quantity', l.quantity,
             'unit_price', l.unit_price,
             'discount_id', l.discount_id,
             'tax_percent', l.tax_percent,
             'amount', l.amount
           ) ORDER BY l.id
         ) FROM invoice_lines l WHERE l.invoice_id = i.id),
         '[]'
       ) AS lines,
       COALESCE(
         (SELECT json_agg(
           json_build_object(
             'id', p.id,
             'method', p.method,
             'amount', p.amount,
             'paid_on', p.paid_on,
             'note', p.note
           ) ORDER BY p.id
         ) FROM payments p WHERE p.invoice_id = i.id),
         '[]'
       ) AS payments
     FROM invoices i
     JOIN users u ON i.customer_id = u.id
     WHERE i.id = $1`,
    [req.params.id]
  );

  const inv = rows[0];
  if (!inv) return res.status(404).send('Invoice not found');

  if (req.user.role === 'customer' && String(inv.customer_id) !== String(req.user.id)) {
    return res.status(404).send('Invoice not found');
  }

  const enriched = enrichInvoice(inv);
  const positiveLines = (inv.lines || []).filter(l => Number(l.amount) >= 0);
  const discountLines = (inv.lines || []).filter(l => Number(l.amount) < 0);
  const payments = inv.payments || [];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${inv.number} - Brightloop Software</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #333;
      background: #fdfdfd;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      padding: 40px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      color: #1e3a8a;
      font-size: 28px;
    }
    .header .subtitle {
      color: #64748b;
      font-size: 14px;
      margin-top: 4px;
    }
    .inv-details {
      text-align: right;
    }
    .inv-details h2 {
      margin: 0 0 8px 0;
      color: #0f172a;
      font-size: 22px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-draft { background: #fef3c7; color: #92400e; }
    .badge-confirmed { background: #dbeafe; color: #1e40af; }
    .badge-paid { background: #d1fae5; color: #065f46; }
    .badge-cancelled { background: #fee2e2; color: #991b1b; }
    .bill-to {
      margin-bottom: 30px;
    }
    .bill-to h3 {
      margin: 0 0 6px 0;
      font-size: 14px;
      text-transform: uppercase;
      color: #64748b;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 30px;
      background: #f8fafc;
      padding: 15px;
      border-radius: 6px;
    }
    .meta-item strong {
      display: block;
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    th {
      text-align: left;
      padding: 10px;
      background: #f1f5f9;
      color: #334155;
      font-size: 13px;
      border-bottom: 2px solid #cbd5e1;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    .text-right { text-align: right; }
    .totals-container {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }
    .totals-table {
      width: 320px;
    }
    .totals-table td {
      padding: 6px 10px;
      border: none;
    }
    .total-row td {
      font-size: 16px;
      font-weight: bold;
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      color: #0f172a;
    }
    .balance-row td {
      font-size: 16px;
      font-weight: bold;
      color: #b91c1c;
      background: #fef2f2;
    }
    .section-title {
      font-size: 16px;
      font-weight: bold;
      margin: 20px 0 10px 0;
      color: #1e293b;
    }
    @media print {
      body { padding: 0; background: #fff; }
      .invoice-card { border: none; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div>
        <h1>Brightloop Software</h1>
        <div class="subtitle">Subscription Billing Management</div>
      </div>
      <div class="inv-details">
        <h2>${inv.number}</h2>
        <span class="badge badge-${inv.status}">${inv.status}</span>
      </div>
    </div>

    <div class="bill-to">
      <h3>Billed To:</h3>
      <div><strong>${inv.customer_name}</strong></div>
      <div>${inv.customer_email}</div>
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <strong>Period Start</strong>
        ${inv.period_start}
      </div>
      <div class="meta-item">
        <strong>Period End</strong>
        ${inv.period_end}
      </div>
      <div class="meta-item">
        <strong>Due Date</strong>
        ${inv.due_date}
      </div>
    </div>

    <div class="section-title">Invoice Lines</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Tax %</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${positiveLines.map(l => `
          <tr>
            <td>${l.description}</td>
            <td class="text-right">${l.quantity}</td>
            <td class="text-right">$${Number(l.unit_price).toFixed(2)}</td>
            <td class="text-right">${Number(l.tax_percent).toFixed(2)}%</td>
            <td class="text-right">$${Number(l.amount).toFixed(2)}</td>
          </tr>
        `).join('')}
        ${discountLines.map(d => `
          <tr style="color: #15803d;">
            <td>${d.description}</td>
            <td class="text-right">${d.quantity}</td>
            <td class="text-right">-$${Math.abs(Number(d.unit_price)).toFixed(2)}</td>
            <td class="text-right">0.00%</td>
            <td class="text-right">-$${Math.abs(Number(d.amount)).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-container">
      <table class="totals-table">
        <tr>
          <td>Subtotal:</td>
          <td class="text-right">$${Number(inv.subtotal).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Discounts:</td>
          <td class="text-right">-$${Number(inv.discount_total).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Taxes:</td>
          <td class="text-right">$${Number(inv.tax_total).toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td>Total:</td>
          <td class="text-right">$${Number(inv.total).toFixed(2)}</td>
        </tr>
        <tr>
          <td>Amount Paid:</td>
          <td class="text-right">$${Number(inv.amount_paid).toFixed(2)}</td>
        </tr>
        <tr class="balance-row">
          <td>Remaining Balance:</td>
          <td class="text-right">$${enriched.balance}</td>
        </tr>
      </table>
    </div>

    ${payments.length > 0 ? `
      <div class="section-title">Payments Received</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Method</th>
            <th>Note</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map(p => `
            <tr>
              <td>${p.paid_on}</td>
              <td style="text-transform: capitalize;">${p.method}</td>
              <td>${p.note || '-'}</td>
              <td class="text-right">$${Number(p.amount).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <div class="no-print" style="margin-top: 30px; text-align: center;">
      <button onclick="window.print()" style="padding: 10px 20px; font-size: 14px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
        Print Invoice
      </button>
    </div>
  </div>
</body>
</html>`;

  res.type('html').send(html);
}));

module.exports = router;
