require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db');
const { generateDueInvoices, toCents, fromCents } = require('../src/services/billing');

const isBulk = process.argv.includes('--bulk');
const bulkCountIdx = process.argv.indexOf('--bulk');
const bulkTarget = isBulk && process.argv[bulkCountIdx + 1] ? parseInt(process.argv[bulkCountIdx + 1], 10) || 5000 : 5000;

async function seed() {
  console.log('Seeding demo data...');
  const client = await pool.connect();

  try {
    // 1. Users: Admin, Staff, and 8 Customers
    const adminPassHash = await bcrypt.hash('Str0ng!Pass', 10);
    const demoPassHash = await bcrypt.hash('Demo@12345', 10);

    // Upsert Admin
    await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Joseph Admin', 'admin@brightloop.com', $1, 'admin')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'admin'
    `, [adminPassHash]);

    // Upsert Staff
    await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Demo Staff', 'staff@brightloop.com', $1, 'staff')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'staff'
    `, [demoPassHash]);

    // Upsert 8 Customers
    const customerIds = [];
    for (let i = 1; i <= 8; i++) {
      const email = `customer${i}@example.com`;
      const name = `Customer ${i}`;
      const { rows } = await client.query(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, 'customer')
        ON CONFLICT (email) DO UPDATE SET name = $1, password_hash = $3, role = 'customer'
        RETURNING id
      `, [name, email, demoPassHash]);
      customerIds.push(rows[0].id);
    }

    // 2. Taxes: GST 18% and GST 5%
    const { rows: tax18Rows } = await client.query(`
      INSERT INTO taxes (name, rate_percent, active)
      VALUES ('GST 18%', 18.00, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const tax18Id = tax18Rows[0]?.id || (await client.query("SELECT id FROM taxes WHERE name = 'GST 18%'")).rows[0].id;

    const { rows: tax5Rows } = await client.query(`
      INSERT INTO taxes (name, rate_percent, active)
      VALUES ('GST 5%', 5.00, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const tax5Id = tax5Rows[0]?.id || (await client.query("SELECT id FROM taxes WHERE name = 'GST 5%'")).rows[0].id;

    // 3. Products and Variants
    // Odoo ERP
    let odooId;
    const odooCheck = await client.query("SELECT id FROM products WHERE name = 'Odoo ERP'");
    if (odooCheck.rows[0]) {
      odooId = odooCheck.rows[0].id;
    } else {
      const { rows } = await client.query(`
        INSERT INTO products (name, type, sales_price, cost_price, notes, active)
        VALUES ('Odoo ERP', 'Software', 1500.00, 800.00, 'Enterprise ERP Suite', true)
        RETURNING id
      `);
      odooId = rows[0].id;
    }

    // Variants for Odoo ERP (Odoo +560, Other +0)
    let odooVarBrandId, odooVarOtherId;
    await client.query(`
      INSERT INTO variants (product_id, attribute, value, extra_price)
      VALUES ($1, 'brand', 'Odoo', 560.00)
      ON CONFLICT (product_id, attribute, value) DO UPDATE SET extra_price = 560.00
    `, [odooId]);
    await client.query(`
      INSERT INTO variants (product_id, attribute, value, extra_price)
      VALUES ($1, 'brand', 'Other', 0.00)
      ON CONFLICT (product_id, attribute, value) DO UPDATE SET extra_price = 0.00
    `, [odooId]);

    const varRows = await client.query('SELECT id, value FROM variants WHERE product_id = $1', [odooId]);
    for (const v of varRows.rows) {
      if (v.value === 'Odoo') odooVarBrandId = v.id;
      if (v.value === 'Other') odooVarOtherId = v.id;
    }

    // Extra products
    async function ensureProduct(name, type, price, cost, notes) {
      const chk = await client.query('SELECT id FROM products WHERE name = $1', [name]);
      if (chk.rows[0]) return chk.rows[0].id;
      const res = await client.query(
        'INSERT INTO products (name, type, sales_price, cost_price, notes, active) VALUES ($1,$2,$3,$4,$5,true) RETURNING id',
        [name, type, price, cost, notes]
      );
      return res.rows[0].id;
    }

    const hostingProdId = await ensureProduct('Cloud Hosting Pro', 'Service', 200.00, 80.00, 'Dedicated cloud instance');
    const backupProdId = await ensureProduct('Automated Backups', 'Addon', 50.00, 10.00, 'Daily encrypted snapshot');

    // 4. Plans (daily, weekly, monthly, yearly with flag mix)
    async function ensurePlan(name, price, period, minQty, autoClose, closable, pausable, renewable) {
      const chk = await client.query('SELECT id FROM plans WHERE name = $1', [name]);
      if (chk.rows[0]) return chk.rows[0].id;
      const res = await client.query(`
        INSERT INTO plans (name, price, period, min_quantity, available_from, available_to, auto_close, closable, pausable, renewable)
        VALUES ($1, $2, $3, $4, '2026-01-01', '2027-12-31', $5, $6, $7, $8)
        RETURNING id
      `, [name, price, period, minQty, autoClose, closable, pausable, renewable]);
      return res.rows[0].id;
    }

    const dailyPlanId = await ensurePlan('Daily Trial', 50.00, 'daily', 1, true, true, false, false);
    const weeklyPlanId = await ensurePlan('Weekly Starter', 300.00, 'weekly', 1, false, true, true, true);
    const monthlyPlanId = await ensurePlan('Monthly Business', 1200.00, 'monthly', 1, false, true, true, true);
    const yearlyPlanId = await ensurePlan('Yearly Enterprise', 12000.00, 'yearly', 1, false, true, false, true);

    // 5. Discounts (one active %, one active fixed, one expired, one with usage_limit 2)
    async function ensureDiscount(name, type, value, scope, productId, minPurchase, minQty, startDate, endDate, limit, used) {
      const chk = await client.query('SELECT id FROM discounts WHERE name = $1', [name]);
      if (chk.rows[0]) return chk.rows[0].id;
      const res = await client.query(`
        INSERT INTO discounts (name, type, value, scope, product_id, min_purchase, min_quantity, start_date, end_date, usage_limit, times_used)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [name, type, value, scope, productId, minPurchase, minQty, startDate, endDate, limit, used]);
      return res.rows[0].id;
    }

    await ensureDiscount('Special 10% Off', 'percentage', 10.00, 'subscription', null, 500.00, 0, '2026-06-01', '2026-12-31', null, 0);
    await ensureDiscount('Flat 100 Off', 'fixed', 100.00, 'subscription', null, 200.00, 0, '2026-06-01', '2026-12-31', null, 0);
    await ensureDiscount('Old Launch Promo', 'percentage', 25.00, 'subscription', null, 0, 0, '2026-01-01', '2026-05-31', null, 5);
    await ensureDiscount('VIP Pass Limited', 'fixed', 250.00, 'subscription', null, 1000.00, 0, '2026-06-01', '2026-12-31', 2, 0);

    // 6. Quotation Templates (2 templates)
    async function ensureTemplate(name, planId, validityDays, lines) {
      const chk = await client.query('SELECT id FROM quotation_templates WHERE name = $1', [name]);
      if (chk.rows[0]) return chk.rows[0].id;
      const res = await client.query(`
        INSERT INTO quotation_templates (name, plan_id, validity_days)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [name, planId, validityDays]);
      const tmplId = res.rows[0].id;
      for (const line of lines) {
        await client.query(`
          INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity)
          VALUES ($1, $2, $3, $4)
        `, [tmplId, line.product_id, line.variant_id || null, line.quantity || 1]);
      }
      return tmplId;
    }

    await ensureTemplate('Standard ERP Package', monthlyPlanId, 30, [
      { product_id: odooId, variant_id: odooVarBrandId, quantity: 1 },
      { product_id: backupProdId, quantity: 1 }
    ]);
    await ensureTemplate('Cloud Hosting Bundle', yearlyPlanId, 45, [
      { product_id: hostingProdId, quantity: 2 },
      { product_id: backupProdId, quantity: 2 }
    ]);

    // 7. Seed ~30 Subscriptions across 4 months and statuses
    const existingSubCount = (await client.query("SELECT COUNT(*) FROM subscriptions WHERE number NOT LIKE 'BULK-%'")).rows[0].count;
    if (parseInt(existingSubCount, 10) < 25) {
      console.log('Generating demo subscriptions...');
      const statuses = [
        'draft', 'draft', 'quotation', 'quotation',
        'confirmed', 'confirmed',
        'active', 'active', 'active', 'active', 'active', 'active', 'active', 'active', 'active',
        'closed', 'closed'
      ];
      const plans = [monthlyPlanId, weeklyPlanId, dailyPlanId, yearlyPlanId];

      for (let i = 0; i < 30; i++) {
        const custId = customerIds[i % customerIds.length];
        const status = statuses[i % statuses.length];
        const planId = plans[i % plans.length];
        const monthOffset = (i % 4) + 1; // 1 to 4 months ago
        const day = 1 + (i % 25);
        const startDate = `2026-0${10 - monthOffset}-${String(day).padStart(2, '0')}`;
        const paused = (status === 'active' && i % 5 === 0);

        const subRes = await client.query(`
          INSERT INTO subscriptions (
            customer_id, plan_id, status, start_date, payment_terms_days, next_invoice_date, paused, created_by
          ) VALUES ($1, $2, $3, $4, 15, $4, $5, $6)
          RETURNING id
        `, [custId, planId, status, startDate, paused, customerIds[0]]);
        const subId = subRes.rows[0].id;

        // Lines
        const qty = 1 + (i % 3);
        const useVariant = (i % 2 === 0);
        const unitPrice = useVariant ? 2060.00 : 1500.00;
        const lineAmt = (qty * unitPrice).toFixed(2);
        await client.query(`
          INSERT INTO subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, tax_id, amount)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [subId, odooId, useVariant ? odooVarBrandId : odooVarOtherId, qty, unitPrice, tax18Id, lineAmt]);
      }
    }

    // 8. Generate due invoices month-by-month and record payments
    console.log('Generating past invoices month-by-month...');
    const pastDates = ['2026-07-15', '2026-08-15', '2026-09-15', '2026-10-15', '2026-10-31'];
    for (const d of pastDates) {
      let runRes;
      let limitLoops = 0;
      do {
        runRes = await generateDueInvoices({ today: d });
        limitLoops++;
      } while (runRes.created > 0 && limitLoops < 15);
    }

    // Confirm most draft invoices
    await client.query(`
      UPDATE invoices
      SET status = 'confirmed'
      WHERE status = 'draft' AND id % 5 <> 0
    `);

    // Record payments: full payments, partial payments, and leave a few overdue
    const confirmedInvoices = (await client.query(`
      SELECT id, total, amount_paid, due_date
      FROM invoices
      WHERE status = 'confirmed'
      ORDER BY id
    `)).rows;

    const methods = ['UPI', 'Card', 'Bank transfer', 'Cash'];
    for (let idx = 0; idx < confirmedInvoices.length; idx++) {
      const inv = confirmedInvoices[idx];
      const remainingCents = toCents(inv.total) - toCents(inv.amount_paid);
      if (remainingCents <= 0) continue;

      if (idx % 3 === 0) {
        // Full payment -> Paid
        const method = methods[idx % methods.length];
        await client.query(`
          INSERT INTO payments (invoice_id, method, amount, paid_on, note, recorded_by)
          VALUES ($1, $2, $3, $4, 'Full payment settled', $5)
        `, [inv.id, method, fromCents(remainingCents), inv.due_date, customerIds[0]]);
        await client.query(`
          UPDATE invoices SET amount_paid = total, status = 'paid' WHERE id = $1
        `, [inv.id]);
      } else if (idx % 3 === 1) {
        // Partial payment -> Remains Confirmed
        const halfCents = Math.floor(remainingCents / 2);
        if (halfCents > 0) {
          const method = methods[idx % methods.length];
          await client.query(`
            INSERT INTO payments (invoice_id, method, amount, paid_on, note, recorded_by)
            VALUES ($1, $2, $3, $4, 'Partial installment', $5)
          `, [inv.id, method, fromCents(halfCents), inv.due_date, customerIds[0]]);
          await client.query(`
            UPDATE invoices SET amount_paid = amount_paid + $1 WHERE id = $2
          `, [fromCents(halfCents), inv.id]);
        }
      }
      // idx % 3 === 2 remains unpaid -> if due_date < CURRENT_DATE, becomes overdue!
    }

    // Make sure at least 3 invoices are strictly overdue for testing
    await client.query(`
      UPDATE invoices
      SET status = 'confirmed', due_date = CURRENT_DATE - 10
      WHERE id IN (
        SELECT id FROM invoices
        WHERE status = 'confirmed' AND amount_paid < total
        LIMIT 3
      )
    `);

    // 9. Bulk insertion if --bulk flag is passed
    if (isBulk) {
      console.log(`Generating bulk ${bulkTarget} active subscriptions with invoices...`);
      // Clean previous bulk if any
      await client.query(`
        DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE subscription_id IN (SELECT id FROM subscriptions WHERE number LIKE 'BULK-%'));
        DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE subscription_id IN (SELECT id FROM subscriptions WHERE number LIKE 'BULK-%'));
        DELETE FROM invoices WHERE subscription_id IN (SELECT id FROM subscriptions WHERE number LIKE 'BULK-%');
        DELETE FROM subscription_lines WHERE subscription_id IN (SELECT id FROM subscriptions WHERE number LIKE 'BULK-%');
        DELETE FROM subscriptions WHERE number LIKE 'BULK-%';
      `);

      const batchSize = 500;
      for (let start = 1; start <= bulkTarget; start += batchSize) {
        const count = Math.min(batchSize, bulkTarget - start + 1);
        const subValues = [];
        const params = [];
        for (let j = 0; j < count; j++) {
          const idx = start + j;
          const num = `BULK-SUB-${String(idx).padStart(6, '0')}`;
          const cust = customerIds[idx % customerIds.length];
          const offset = params.length;
          subValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, 'active', '2026-01-01', false, '2026-11-01')`);
          params.push(num, cust, monthlyPlanId);
        }

        const { rows: insertedSubs } = await client.query(`
          INSERT INTO subscriptions (number, customer_id, plan_id, status, start_date, paused, next_invoice_date)
          VALUES ${subValues.join(',')}
          RETURNING id, customer_id
        `, params);

        // Lines and Invoices
        const lineValues = [];
        const invValues = [];
        const subLineParams = [];
        const invParams = [];

        for (let j = 0; j < insertedSubs.length; j++) {
          const s = insertedSubs[j];
          const lOffset = subLineParams.length;
          lineValues.push(`($${lOffset + 1}, $${lOffset + 2}, 1, 1500.00, 1500.00)`);
          subLineParams.push(s.id, odooId);

          const iOffset = invParams.length;
          const invNum = `BULK-INV-${String(s.id).padStart(7, '0')}`;
          invValues.push(`($${iOffset + 1}, $${iOffset + 2}, $${iOffset + 3}, '2026-10-01', '2026-10-31', 'confirmed', 1500.00, 1500.00, 500.00, '2026-10-15')`);
          invParams.push(invNum, s.id, s.customer_id);
        }

        await client.query(`
          INSERT INTO subscription_lines (subscription_id, product_id, quantity, unit_price, amount)
          VALUES ${lineValues.join(',')}
        `, subLineParams);

        await client.query(`
          INSERT INTO invoices (number, subscription_id, customer_id, period_start, period_end, status, subtotal, total, amount_paid, due_date)
          VALUES ${invValues.join(',')}
        `, invParams);
      }
      console.log(`Successfully added ${bulkTarget} bulk subscriptions and invoices.`);
    }

    console.log('\n================ DEMO ACCOUNTS ================');
    console.log('Role       Email                     Password');
    console.log('-----------------------------------------------');
    console.log('Admin      admin@brightloop.com      Str0ng!Pass');
    console.log('Staff      staff@brightloop.com      Demo@12345');
    console.log('Customer   customer1@example.com     Demo@12345');
    console.log('Customer   customer2..8@example.com  Demo@12345');
    console.log('===============================================\n');

  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
