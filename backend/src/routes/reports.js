const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { wrap, paging } = require('../services/http');

const staffOrAdmin = [requireAuth, requireRole('admin', 'staff')];

// 10-second in-memory cache keyed by original URL; ?fresh=true bypasses it
const cache = new Map();
const CACHE_TTL_MS = 10000;

function reportCache(req, res, next) {
  if (req.query.fresh === 'true') {
    return next();
  }
  const key = req.originalUrl || req.url;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return res.json(cached.data);
  }
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(key, { time: Date.now(), data: body });
    }
    return origJson(body);
  };
  next();
}

const fmtMoney = (val) => Number(val || 0).toFixed(2);

// GET /api/reports/summary?from=&to=
router.get('/summary', ...staffOrAdmin, reportCache, wrap(async (req, res) => {
  const from = req.query.from || null;
  const to = req.query.to || null;

  const { rows } = await pool.query(
    `SELECT
       -- Subscriptions aggregations
       COUNT(*) FILTER (WHERE s.status = 'active' AND NOT s.paused)::int AS active_subscriptions,
       COUNT(*) FILTER (WHERE s.status = 'active' AND s.paused)::int AS paused_subscriptions,
       json_build_object(
         'draft', COUNT(*) FILTER (WHERE s.status = 'draft')::int,
         'quotation', COUNT(*) FILTER (WHERE s.status = 'quotation')::int,
         'confirmed', COUNT(*) FILTER (WHERE s.status = 'confirmed')::int,
         'active', COUNT(*) FILTER (WHERE s.status = 'active')::int,
         'closed', COUNT(*) FILTER (WHERE s.status = 'closed')::int
       ) AS subscriptions_by_status,

       -- Invoices aggregations
       (SELECT json_build_object(
         'draft', COUNT(*) FILTER (WHERE i.status = 'draft')::int,
         'confirmed', COUNT(*) FILTER (WHERE i.status = 'confirmed')::int,
         'paid', COUNT(*) FILTER (WHERE i.status = 'paid')::int,
         'cancelled', COUNT(*) FILTER (WHERE i.status = 'cancelled')::int
       ) FROM invoices i) AS invoices_by_status,

       (SELECT COALESCE(SUM(i.total - i.amount_paid), 0)
        FROM invoices i
        WHERE i.status = 'confirmed') AS outstanding,

       (SELECT COUNT(*)::int
        FROM invoices i
        WHERE i.status = 'confirmed' AND i.due_date < CURRENT_DATE AND i.amount_paid < i.total) AS overdue_count,

       (SELECT COALESCE(SUM(i.total - i.amount_paid), 0)
        FROM invoices i
        WHERE i.status = 'confirmed' AND i.due_date < CURRENT_DATE AND i.amount_paid < i.total) AS overdue_amount,

       -- Payments aggregations (respecting from/to)
       (SELECT COALESCE(SUM(p.amount), 0)
        FROM payments p
        WHERE ($1::date IS NULL OR p.paid_on >= $1::date)
          AND ($2::date IS NULL OR p.paid_on <= $2::date)) AS revenue_collected,

       (SELECT COUNT(*)::int
        FROM payments p
        WHERE ($1::date IS NULL OR p.paid_on >= $1::date)
          AND ($2::date IS NULL OR p.paid_on <= $2::date)) AS payments_count
     FROM subscriptions s`,
    [from, to]
  );

  const row = rows[0] || {};
  res.json({
    active_subscriptions: Number(row.active_subscriptions || 0),
    paused_subscriptions: Number(row.paused_subscriptions || 0),
    subscriptions_by_status: row.subscriptions_by_status || {
      draft: 0,
      quotation: 0,
      confirmed: 0,
      active: 0,
      closed: 0
    },
    invoices_by_status: row.invoices_by_status || {
      draft: 0,
      confirmed: 0,
      paid: 0,
      cancelled: 0
    },
    revenue_collected: fmtMoney(row.revenue_collected),
    outstanding: fmtMoney(row.outstanding),
    overdue_count: Number(row.overdue_count || 0),
    overdue_amount: fmtMoney(row.overdue_amount),
    payments_count: Number(row.payments_count || 0)
  });
}));

// GET /api/reports/revenue-by-month?months=12
router.get('/revenue-by-month', ...staffOrAdmin, reportCache, wrap(async (req, res) => {
  const months = Math.min(60, Math.max(1, parseInt(req.query.months, 10) || 12));

  const { rows } = await pool.query(
    `WITH months_series AS (
       SELECT to_char(d, 'YYYY-MM') AS month
       FROM generate_series(
         date_trunc('month', CURRENT_DATE) - ($1::int - 1) * interval '1 month',
         date_trunc('month', CURRENT_DATE),
         interval '1 month'
       ) d
     ),
     inv AS (
       SELECT to_char(period_start, 'YYYY-MM') AS month,
              COALESCE(SUM(total), 0) AS invoiced
       FROM invoices
       WHERE status <> 'cancelled'
       GROUP BY 1
     ),
     pay AS (
       SELECT to_char(paid_on, 'YYYY-MM') AS month,
              COALESCE(SUM(amount), 0) AS collected
       FROM payments
       GROUP BY 1
     )
     SELECT m.month,
            COALESCE(i.invoiced, 0) AS invoiced,
            COALESCE(p.collected, 0) AS collected
     FROM months_series m
     LEFT JOIN inv i ON m.month = i.month
     LEFT JOIN pay p ON m.month = p.month
     ORDER BY m.month ASC`,
    [months]
  );

  res.json({
    items: rows.map(r => ({
      month: r.month,
      invoiced: fmtMoney(r.invoiced),
      collected: fmtMoney(r.collected)
    }))
  });
}));

// GET /api/reports/overdue?page&limit
router.get('/overdue', ...staffOrAdmin, reportCache, wrap(async (req, res) => {
  const { limit, offset, page } = paging(req);

  const { rows } = await pool.query(
    `SELECT i.id,
            i.number,
            u.name AS customer_name,
            to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
            (CURRENT_DATE - i.due_date)::int AS days_overdue,
            i.total,
            i.amount_paid,
            (i.total - i.amount_paid) AS balance,
            COUNT(*) OVER()::int AS total_count
     FROM invoices i
     JOIN users u ON i.customer_id = u.id
     WHERE i.status = 'confirmed'
       AND i.due_date < CURRENT_DATE
       AND i.amount_paid < i.total
     ORDER BY i.due_date ASC, i.id ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const total = rows[0] ? Number(rows[0].total_count) : 0;
  res.json({
    page,
    limit,
    total,
    items: rows.map(r => ({
      id: Number(r.id),
      number: r.number,
      customer_name: r.customer_name,
      due_date: r.due_date,
      days_overdue: Number(r.days_overdue),
      total: fmtMoney(r.total),
      amount_paid: fmtMoney(r.amount_paid),
      balance: fmtMoney(r.balance)
    }))
  });
}));

// GET /api/reports/payments-by-method?from=&to=
router.get('/payments-by-method', ...staffOrAdmin, reportCache, wrap(async (req, res) => {
  const from = req.query.from || null;
  const to = req.query.to || null;

  const { rows } = await pool.query(
    `SELECT p.method,
            COUNT(*)::int AS count,
            COALESCE(SUM(p.amount), 0) AS amount
     FROM payments p
     WHERE ($1::date IS NULL OR p.paid_on >= $1::date)
       AND ($2::date IS NULL OR p.paid_on <= $2::date)
     GROUP BY p.method
     ORDER BY amount DESC`,
    [from, to]
  );

  res.json({
    items: rows.map(r => ({
      method: r.method,
      count: Number(r.count),
      amount: fmtMoney(r.amount)
    }))
  });
}));

module.exports = router;
