CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('admin','staff','customer');
CREATE TYPE billing_period AS ENUM ('daily','weekly','monthly','yearly');
CREATE TYPE sub_status AS ENUM ('draft','quotation','confirmed','active','closed');
CREATE TYPE invoice_status AS ENUM ('draft','confirmed','paid','cancelled');
CREATE TYPE discount_type AS ENUM ('fixed','percentage');
CREATE TYPE discount_scope AS ENUM ('product','subscription');

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  reset_token_hash TEXT,
  reset_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  sales_price NUMERIC(12,2) NOT NULL CHECK (sales_price >= 0),
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  extra_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (product_id, attribute, value)
);

CREATE TABLE plans (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  period billing_period NOT NULL,
  min_quantity INT NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  available_from DATE,
  available_to DATE,
  auto_close BOOLEAN NOT NULL DEFAULT false,
  closable BOOLEAN NOT NULL DEFAULT false,
  pausable BOOLEAN NOT NULL DEFAULT false,
  renewable BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE taxes (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  rate_percent NUMERIC(5,2) NOT NULL CHECK (rate_percent >= 0),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE quotation_templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id BIGINT NOT NULL REFERENCES plans(id),
  validity_days INT NOT NULL CHECK (validity_days > 0)
);
CREATE TABLE quotation_template_lines (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  variant_id BIGINT REFERENCES variants(id),
  quantity INT NOT NULL DEFAULT 1
);

CREATE TABLE discounts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type discount_type NOT NULL,
  value NUMERIC(12,2) NOT NULL CHECK (value > 0),
  scope discount_scope NOT NULL,
  product_id BIGINT REFERENCES products(id),
  min_purchase NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_quantity INT NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  usage_limit INT,
  times_used INT NOT NULL DEFAULT 0,
  CHECK (end_date >= start_date),
  CHECK (scope <> 'product' OR product_id IS NOT NULL)
);

CREATE SEQUENCE subscription_number_seq;
CREATE TABLE subscriptions (
  id BIGSERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE DEFAULT ('SUB-' || lpad(nextval('subscription_number_seq')::text, 6, '0')),
  customer_id BIGINT NOT NULL REFERENCES users(id),
  plan_id BIGINT NOT NULL REFERENCES plans(id),
  template_id BIGINT REFERENCES quotation_templates(id),
  status sub_status NOT NULL DEFAULT 'draft',
  start_date DATE NOT NULL,
  expiry_date DATE,
  payment_terms_days INT NOT NULL DEFAULT 15,
  next_invoice_date DATE,
  paused BOOLEAN NOT NULL DEFAULT false,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE subscription_lines (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  variant_id BIGINT REFERENCES variants(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  tax_id BIGINT REFERENCES taxes(id),
  amount NUMERIC(12,2) NOT NULL
);

CREATE SEQUENCE invoice_number_seq;
CREATE TABLE invoices (
  id BIGSERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id),
  customer_id BIGINT NOT NULL REFERENCES users(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC(12,2) NOT NULL,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, period_start)
);
CREATE TABLE invoice_lines (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount_id BIGINT REFERENCES discounts(id),
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL
);

CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  method TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  recorded_by BIGINT REFERENCES users(id)
);

CREATE INDEX ON subscriptions (customer_id);
CREATE INDEX ON subscriptions (status);
CREATE INDEX ON subscriptions (next_invoice_date) WHERE status = 'active';
CREATE INDEX ON subscription_lines (subscription_id);
CREATE INDEX ON invoices (customer_id);
CREATE INDEX ON invoices (status, due_date);
CREATE INDEX ON invoice_lines (invoice_id);
CREATE INDEX ON payments (invoice_id);
CREATE INDEX ON payments (paid_on);
