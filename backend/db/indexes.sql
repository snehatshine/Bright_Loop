-- Indexes for high-performance reporting, billing queries, and filtered lists

-- Subscriptions: status and paused filtering for summary report
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_paused ON subscriptions (status, paused);

-- Invoices: fast monthly aggregation by period_start excluding cancelled
CREATE INDEX IF NOT EXISTS idx_invoices_period_start_status ON invoices (period_start, status);

-- Invoices: fast overdue reporting and filtering
CREATE INDEX IF NOT EXISTS idx_invoices_overdue ON invoices (due_date, amount_paid, total)
  WHERE status = 'confirmed';

-- Invoices: lookups by subscription
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON invoices (subscription_id);

-- Payments: fast method aggregation by date range
CREATE INDEX IF NOT EXISTS idx_payments_paid_on_method ON payments (paid_on, method);

-- Users: filtering by role and email/name search
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Discounts: active date-window and scope checks used during invoice generation
CREATE INDEX IF NOT EXISTS idx_discounts_scope_dates ON discounts (scope, start_date, end_date);

-- Products: active products catalog listing
CREATE INDEX IF NOT EXISTS idx_products_active_id ON products (active, id DESC);
