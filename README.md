# Brightloop

**Brightloop** is a modern, enterprise-grade subscription and billing management system built for high reliability, exact financial calculations, and seamless customer self-service.

---

## 🌟 Features Mapped to Requirements

1. **Authentication & Multi-Role Authorization**
   - Secure customer signup, login, password reset flow (with strength enforcement: >8 chars, uppercase, lowercase, special char).
   - Role-based access control (`admin`, `staff`, `customer`). Admin/staff manage subscriptions and catalog; customers have isolated self-service.
2. **Product Catalog & Variants**
   - Product management with pricing, cost tracking, soft deletion, and multi-attribute variants with dynamic extra pricing (e.g. Odoo brand variant +₹560.00).
3. **Recurring Plans**
   - Flexible billing cycles (`daily`, `weekly`, `monthly`, `yearly`).
   - Granular flags: `auto_close`, `closable`, `pausable`, `renewable`, and availability date windows.
4. **Quotation Templates**
   - Pre-packaged product and line bundles with predefined validity days for quick subscription generation.
5. **Subscription Lifecycle & State Machine**
   - Forward-only state transitions: `draft` ➔ `quotation` ➔ `confirmed` ➔ `active` ➔ `closed`.
   - Dynamic operations: Pause, Resume, Renew (period extension), and Auto-close for expired subscriptions.
6. **Idempotent Billing & Automated Invoicing**
   - Automated due invoice generation by scheduled cron or on-demand trigger.
   - Financial accuracy using integer cents and standard round-half-up math.
   - Guaranteed idempotency through database constraints and row locking.
7. **Discounts & Multi-Tier Taxes**
   - Percentage and fixed discounts with product/subscription scopes, minimum quantity/purchase thresholds, active date ranges, and atomic usage-limit decrements.
   - Configurable GST/sales taxes applied per line.
8. **Invoices, Payments & Executive Reports**
   - Full invoice lifecycle (`draft` ➔ `confirmed` ➔ `paid` / `cancelled`), printable HTML invoices, payment recording with balance validation (no overpayment), and executive dashboards with instant analytical summaries and month-by-month trends.

---

## 🛠️ Stack

- **Backend:** Node.js, Express 4, PostgreSQL, `pg`, `bcryptjs`, `jsonwebtoken`, `node-cron`, `nodemailer`.
- **Frontend:** React 19, React Router v7, Native CSS design tokens & SVG charts (zero heavy chart/UI library dependencies).
- **Database:** PostgreSQL with citext extension, custom enum types, sequence generators, and performance-tuned compound indexes.

---

## 📁 Folder Structure

```
Bright_Loop/
├── README.md                      # Comprehensive project documentation
├── backend/
│   ├── .env                       # Environment configuration (secrets kept private)
│   ├── package.json               # Backend dependencies & lifecycle scripts
│   ├── db/
│   │   ├── schema.sql             # Relational DDL, enums, tables, sequences, foreign keys
│   │   ├── indexes.sql            # High-performance compound indexes for reports/filters
│   │   ├── migrate.js             # Schema migration runner
│   │   ├── apply-indexes.js       # Index application runner
│   │   ├── seed-admin.js          # Admin account initializer
│   │   └── seed-demo.js           # Idempotent demo seeder (with optional --bulk)
│   ├── scripts/
│   │   └── smoke-test.js          # Automated end-to-end API test suite
│   └── src/
│       ├── app.js                 # Express server & auto route mounting
│       ├── db.js                  # PostgreSQL connection pool
│       ├── middleware/
│       │   └── auth.js            # JWT verification & role-based route guards
│       ├── routes/
│       │   ├── auth.js            # Authentication, signup, password resets
│       │   ├── users.js           # Staff creation, user listings, profiles
│       │   ├── products.js        # Products catalog & variants
│       │   ├── plans.js           # Recurring plan definitions & constraints
│       │   ├── taxes.js           # Tax rules
│       │   ├── templates.js       # Quotation templates & lines
│       │   ├── subscriptions.js   # Subscription state machine & lines
│       │   ├── discounts.js       # Promotional discounts & usage limits
│       │   ├── invoices.js        # Invoices, PDF/HTML print, email delivery
│       │   ├── payments.js        # Transaction ledger & payment settlement
│       │   └── reports.js         # Analytics, executive summary, overdue, trends
│       └── services/
│           ├── http.js            # Express wrapper, pagination, numeric helpers
│           ├── billing.js         # Financial math, invoice generator, discounts
│           ├── scheduler.js       # Cron job for daily 01:00 billing cycle
│           └── subscriptionRules.js # State machine validator & auto-close logic
└── frontend/
    ├── package.json               # Frontend dependencies & scripts
    ├── vite.config.js             # Vite build configuration
    └── src/
        ├── api.js                 # API fetch client, token management, print helper
        ├── auth.jsx               # AuthContext, login, signup, session storage
        ├── index.css              # Design tokens, color palette, responsive typography
        ├── App.jsx                # Router, role routing guards, navigation shell
        ├── components/            # Reusable UI primitives (DataTable, Modal, Toast, etc.)
        └── pages/                 # Admin, staff, and customer portal screens
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)

### 2. Environment Setup
Configure `backend/.env` with your PostgreSQL credentials:
```env
PORT=4000
DATABASE_URL=postgres://username:password@localhost:5432/brightloop
JWT_SECRET=super_secret_jwt_key_brightloop_2026
APP_URL=http://localhost:5173
```

### 3. Database Migration & Seed
Run in `backend/`:
```bash
# 1. Install dependencies
npm install

# 2. Run database migration
npm run migrate

# 3. Apply performance indexes
npm run indexes

# 4. Seed demo data
npm run seed:demo
```

### 4. Running the Applications
In two separate terminals:
```bash
# Terminal 1: Start Backend (http://localhost:4000)
cd backend
npm run dev

# Terminal 2: Start Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

---

## 👥 Demo Accounts

| Role | Email | Password | Access Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@brightloop.com` | `Str0ng!Pass` | Full administrative access, staff creation, discounts, reports, full writes |
| **Staff** | `staff@brightloop.com` | `Demo@12345` | Subscriptions, invoices, payments, customers; read-only on discounts & staff |
| **Customer** | `customer1@example.com` | `Demo@12345` | Customer self-service portal: view own subscriptions, invoices, payments, print |
| **Customer** | `customer2..8@example.com` | `Demo@12345` | Individual customer accounts for multi-tenant isolation tests |

---

## 🔒 How Billing Stays Idempotent

Brightloop employs a multi-layered defense to guarantee that invoice generation is 100% idempotent:
1. **Unique Constraint:** `UNIQUE (subscription_id, period_start)` on `invoices` ensures the database physically rejects duplicate invoices for the same subscription period.
2. **Next Invoice Pointer (`next_invoice_date`):** Subscriptions track their next billing date. Once billed, the pointer advances to the next period.
3. **Database Row Locks (`FOR UPDATE SKIP LOCKED`):** Prevents race conditions during concurrent cron runs or simultaneous manual triggers.
4. **Atomic Discount Claim:** Atomic checks ensure discounts with `usage_limit` are claimed atomically inside the invoice transaction without over-allocation.
5. **Integer Cents Representation:** All money amounts are calculated in integer cents to eliminate floating-point inaccuracies.

---

## 🛡️ Roles & Permissions Matrix

| Resource / Action | Admin | Staff | Customer |
| :--- | :---: | :---: | :---: |
| **View Dashboard & Reports** | ✅ | ✅ | ❌ (403) |
| **Manage Products & Plans** | ✅ | ❌ Read Only | ❌ (403) |
| **Manage Discounts** | ✅ | ❌ Read Only | ❌ (403) |
| **Create & Manage Staff** | ✅ | ❌ (403) | ❌ (403) |
| **Manage Subscriptions** | ✅ | ✅ | ❌ (Own view only) |
| **Confirm & Send Invoices** | ✅ | ✅ | ❌ (Own view & print) |
| **Record Payments** | ✅ | ✅ | ❌ (403) |
| **Customer Portal** | Redirects | Redirects | ✅ |

---

## ⚡ Performance & Indexing

All endpoints are built for sub-second responses:
- Indexes on `(status, paused)` for subscriptions and `(period_start, status)` on invoices.
- Composite index on `(due_date, amount_paid, total) WHERE status = 'confirmed'` for instant overdue invoice filtering.
- In-memory 10-second caching on `/api/reports/*` to handle burst traffic with `?fresh=true` bypass.
- Stress tested with 5,000+ active subscriptions responding in under 300 ms.

---

## ⏱️ 5-Minute Demo Script

1. **Sign in as Admin** (`admin@brightloop.com` / `Str0ng!Pass`).
2. **Review Executive Dashboard**: Examine active subscriptions, revenue collected, outstanding balance, inline SVG monthly revenue trends, and overdue accounts.
3. **Product & Plan Creation**:
   - Navigate to **Products**, create a product with an attribute variant (e.g., brand: Odoo +₹560.00).
   - Navigate to **Plans**, create a monthly plan with pausable and renewable enabled.
4. **Subscription Lifecycle**:
   - Create a new subscription for `customer1@example.com`.
   - Step through transitions: **Draft ➔ Quotation ➔ Confirmed ➔ Active**.
   - Test **Pause** and **Resume** functionality.
5. **Billing & Invoicing**:
   - Click **Generate due invoices** on the Invoices screen.
   - Open the generated invoice, click **Confirm**, then click **Print** to open the branded printable invoice.
   - Record a partial payment (observe status remains `confirmed` and balance decreases).
   - Record the final balance payment (observe status transitions to `paid`).
6. **Role Guard Verification**:
   - Sign in as **Staff** (`staff@brightloop.com`): Notice write buttons for discounts and staff are cleanly hidden.
   - Sign in as **Customer** (`customer1@example.com`): Notice clean self-service portal showing only their own active subscriptions, open invoices, and payment histories.

---

## 👨‍💻 Team & Contributions

- **Joseph:** Authentication & security, product catalog & variants, taxes, executive reports API & caching, demo seed script, smoke test suite.
- **Sneha:** Quotation templates, subscription state machine, lifecycle transitions, and auto-close rules.
- **Austin:** Billing engine, automated invoice generator, discounts engine, and payments ledger.
- **Gayathri:** Frontend architecture, responsive layout, role-based navigation, components, and dashboard charts.
