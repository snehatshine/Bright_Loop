const http = require('http');

const BASE = process.env.API_URL || 'http://localhost:4000/api';

async function req(path, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(BASE + path);
  const data = body ? JSON.stringify(body) : null;
  const opts = {
    method,
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    }
  };

  return new Promise((resolve, reject) => {
    const request = http.request(opts, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(raw); } catch { json = raw; }
        resolve({ status: res.statusCode, data: json });
      });
    });
    request.on('error', reject);
    if (data) request.write(data);
    request.end();
  });
}

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

async function runSmokeTests() {
  console.log('--- Running Brightloop Smoke Tests ---');

  // 1. Password validation tests
  await check('Password validation: reject <= 8 characters', async () => {
    const res = await req('/auth/signup', {
      method: 'POST',
      body: { name: 'Test', email: 'pw1@test.com', password: 'Ab!1' }
    });
    assert(res.status === 400 && res.data.error.includes('8 characters'), `Expected 400, got ${res.status}`);
  });

  await check('Password validation: reject missing uppercase', async () => {
    const res = await req('/auth/signup', {
      method: 'POST',
      body: { name: 'Test', email: 'pw2@test.com', password: 'lowercase!123' }
    });
    assert(res.status === 400 && res.data.error.includes('uppercase'), `Expected 400, got ${res.status}`);
  });

  await check('Password validation: reject missing lowercase', async () => {
    const res = await req('/auth/signup', {
      method: 'POST',
      body: { name: 'Test', email: 'pw3@test.com', password: 'UPPERCASE!123' }
    });
    assert(res.status === 400 && res.data.error.includes('lowercase'), `Expected 400, got ${res.status}`);
  });

  await check('Password validation: reject missing special character', async () => {
    const res = await req('/auth/signup', {
      method: 'POST',
      body: { name: 'Test', email: 'pw4@test.com', password: 'NoSpecial1234' }
    });
    assert(res.status === 400 && res.data.error.includes('special character'), `Expected 400, got ${res.status}`);
  });

  const testEmail = `user_${Date.now()}@test.com`;
  let customerToken;
  let customerUser;
  await check('Signup: accept valid password', async () => {
    const res = await req('/auth/signup', {
      method: 'POST',
      body: { name: 'Valid User', email: testEmail, password: 'Valid!Password123' }
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.token && res.data.user.role === 'customer', 'User created with customer role');
    customerToken = res.data.token;
    customerUser = res.data.user;
  });

  await check('Signup: duplicate email returns 409', async () => {
    const res = await req('/auth/signup', {
      method: 'POST',
      body: { name: 'Valid User 2', email: testEmail, password: 'Valid!Password123' }
    });
    assert(res.status === 409, `Expected 409, got ${res.status}`);
  });

  // 2. Login test
  let adminToken;
  let staffToken;
  await check('Login: admin authentication', async () => {
    const res = await req('/auth/login', {
      method: 'POST',
      body: { email: 'admin@brightloop.com', password: 'Str0ng!Pass' }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.token && res.data.user.role === 'admin', 'Admin logged in');
    adminToken = res.data.token;
  });

  await check('Login: staff authentication', async () => {
    const res = await req('/auth/login', {
      method: 'POST',
      body: { email: 'staff@brightloop.com', password: 'Demo@12345' }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.token && res.data.user.role === 'staff', 'Staff logged in');
    staffToken = res.data.token;
  });

  // 3. Customer Role Restrictions
  await check('Customer gets 403 on POST /api/products', async () => {
    const res = await req('/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { name: 'Hacked', type: 'Evil', sales_price: 10 }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await check('Customer gets 403 on POST /api/discounts', async () => {
    const res = await req('/discounts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { name: 'HackDisc', type: 'fixed', value: 10, scope: 'subscription', start_date: '2026-01-01', end_date: '2026-12-31' }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await check('Customer gets 403 on GET /api/reports/summary', async () => {
    const res = await req('/reports/summary', {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // 4. Staff Role Restrictions
  await check('Staff gets 403 on POST /api/discounts', async () => {
    const res = await req('/discounts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: { name: 'StaffDisc', type: 'fixed', value: 10, scope: 'subscription', start_date: '2026-01-01', end_date: '2026-12-31' }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await check('Staff gets 403 on POST /api/users/staff', async () => {
    const res = await req('/users/staff', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: { name: 'Sub Staff', email: 'substaff@brightloop.com', password: 'Demo@12345' }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // 5. Customer isolation: customer gets 404 on other customer's subscriptions and invoices
  await check('Customer sees 404 on others subscriptions', async () => {
    // Fetch any subscription from admin
    const listRes = await req('/subscriptions?limit=1', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const otherSub = listRes.data.items?.[0];
    if (otherSub && otherSub.customer_id !== customerUser.id) {
      const res = await req(`/subscriptions/${otherSub.id}`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert(res.status === 404, `Expected 404 for other sub, got ${res.status}`);
    }
  });

  await check('Customer sees 404 on others invoices', async () => {
    const listRes = await req('/invoices?limit=1', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const otherInv = listRes.data.items?.[0];
    if (otherInv && otherInv.customer_id !== customerUser.id) {
      const res = await req(`/invoices/${otherInv.id}`, {
        headers: { Authorization: `Bearer ${customerToken}` }
      });
      assert(res.status === 404, `Expected 404 for other invoice, got ${res.status}`);
    }
  });

  // 6. Idempotency: POST /api/invoices/generate twice
  await check('POST /api/invoices/generate idempotency (second run creates 0)', async () => {
    const res1 = await req('/invoices/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { today: '2026-10-31' }
    });
    assert(res1.status === 200, `First generate status: ${res1.status}`);

    const res2 = await req('/invoices/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { today: '2026-10-31' }
    });
    assert(res2.status === 200, `Second generate status: ${res2.status}`);
    assert(res2.data.created === 0, `Expected 0 created on second run, got ${res2.data.created}`);
  });

  // 7. Subscription workflow & illegal jump -> 400
  let testSubId;
  await check('Subscription creation and illegal status jump rejection', async () => {
    // Get plan and product
    const plansRes = await req('/plans?limit=1', { headers: { Authorization: `Bearer ${adminToken}` } });
    const plan = plansRes.data.items[0];
    const prodsRes = await req('/products?limit=1', { headers: { Authorization: `Bearer ${adminToken}` } });
    const prod = prodsRes.data.items[0];

    const createRes = await req('/subscriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        customer_id: customerUser.id,
        plan_id: plan.id,
        start_date: '2026-11-01',
        payment_terms_days: 15,
        lines: [{ product_id: prod.id, quantity: 1 }]
      }
    });
    assert(createRes.status === 201, `Sub created, status ${createRes.status}`);
    testSubId = createRes.data.id;
    assert(createRes.data.status === 'draft', 'Initial status is draft');

    // Illegal jump: draft directly to active -> 400
    const jumpRes = await req(`/subscriptions/${testSubId}/transition`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { to: 'active' }
    });
    assert(jumpRes.status === 400, `Expected 400 for illegal status jump, got ${jumpRes.status}`);
  });

  // 8. Invoice lifecycle: draft -> confirmed -> partial payment -> paid & overpayment 400
  await check('Invoice lifecycle: draft -> confirmed -> partial payment -> paid & overpayment rejection', async () => {
    // Find or generate a draft invoice
    const invList = await req('/invoices?status=draft&limit=1', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    let inv = invList.data.items?.[0];
    if (!inv) {
      // Find an active subscription to bill
      const subList = await req('/subscriptions?status=active&limit=1', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const activeSub = subList.data.items?.[0];
      assert(activeSub, 'Need active subscription for invoice test');
      // Trigger generate for next period
      await req('/invoices/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { today: '2027-01-01' }
      });
      const retryList = await req('/invoices?limit=1', { headers: { Authorization: `Bearer ${adminToken}` } });
      inv = retryList.data.items?.[0];
    }
    assert(inv, 'Found invoice for payment test');

    // If draft, confirm it
    if (inv.status === 'draft') {
      const confRes = await req(`/invoices/${inv.id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(confRes.status === 200 && confRes.data.status === 'confirmed', 'Invoice confirmed');
      inv = confRes.data;
    }

    const total = Number(inv.total);
    const paid = Number(inv.amount_paid);
    const bal = total - paid;

    if (bal > 2) {
      // Overpayment check -> 400
      const overRes = await req('/payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          invoice_id: inv.id,
          method: 'Card',
          amount: (bal + 100).toFixed(2)
        }
      });
      assert(overRes.status === 400, `Expected 400 on overpayment, got ${overRes.status}`);

      // Partial payment -> remains confirmed
      const partialAmt = (bal / 2).toFixed(2);
      const partRes = await req('/payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          invoice_id: inv.id,
          method: 'Card',
          amount: partialAmt
        }
      });
      assert(partRes.status === 201 && partRes.data.invoice.status === 'confirmed', 'Partial payment keeps invoice confirmed');

      // Final payment -> becomes paid
      const finalBal = Number(partRes.data.invoice.balance);
      const finalRes = await req('/payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          invoice_id: inv.id,
          method: 'Card',
          amount: finalBal.toFixed(2)
        }
      });
      assert(finalRes.status === 201 && finalRes.data.invoice.status === 'paid', 'Final payment marks invoice paid');
    }
  });

  // 9. Report contracts verification
  await check('Report API: GET /api/reports/summary contract', async () => {
    const res = await req('/reports/summary', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const d = res.data;
    assert(typeof d.active_subscriptions === 'number', 'active_subscriptions is number');
    assert(typeof d.paused_subscriptions === 'number', 'paused_subscriptions is number');
    assert(d.subscriptions_by_status && typeof d.subscriptions_by_status.active === 'number', 'subscriptions_by_status valid');
    assert(d.invoices_by_status && typeof d.invoices_by_status.confirmed === 'number', 'invoices_by_status valid');
    assert(typeof d.revenue_collected === 'string' && /^\d+\.\d{2}$/.test(d.revenue_collected), 'revenue_collected 2-decimal string');
    assert(typeof d.outstanding === 'string' && /^\d+\.\d{2}$/.test(d.outstanding), 'outstanding 2-decimal string');
    assert(typeof d.overdue_count === 'number', 'overdue_count is number');
    assert(typeof d.overdue_amount === 'string' && /^\d+\.\d{2}$/.test(d.overdue_amount), 'overdue_amount 2-decimal string');
    assert(typeof d.payments_count === 'number', 'payments_count is number');
  });

  await check('Report API: GET /api/reports/revenue-by-month contract', async () => {
    const res = await req('/reports/revenue-by-month?months=12', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.items), 'items is array');
    assert(res.data.items.length === 12, `Expected 12 months, got ${res.data.items.length}`);
    const item = res.data.items[0];
    assert(item.month && typeof item.invoiced === 'string' && typeof item.collected === 'string', 'items have month, invoiced, collected');
  });

  await check('Report API: GET /api/reports/overdue contract', async () => {
    const res = await req('/reports/overdue', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.data.total === 'number', 'total is number');
    assert(Array.isArray(res.data.items), 'items is array');
    if (res.data.items.length > 0) {
      const item = res.data.items[0];
      assert(item.id && item.number && item.customer_name && item.due_date, 'overdue item fields valid');
      assert(typeof item.days_overdue === 'number', 'days_overdue is number');
      assert(typeof item.total === 'string' && typeof item.amount_paid === 'string' && typeof item.balance === 'string', 'money fields formatted');
    }
  });

  await check('Report API: GET /api/reports/payments-by-method contract', async () => {
    const res = await req('/reports/payments-by-method', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.items), 'items is array');
    if (res.data.items.length > 0) {
      const item = res.data.items[0];
      assert(item.method && typeof item.count === 'number' && typeof item.amount === 'string', 'method item fields valid');
    }
  });

  await check('Users API: GET /api/users contract and security', async () => {
    const res = await req('/users?role=customer', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.data.total === 'number' && Array.isArray(res.data.items), 'users list contract');
    for (const u of res.data.items) {
      assert(u.password_hash === undefined, 'No password_hash exposed');
      assert(u.reset_token_hash === undefined, 'No reset_token_hash exposed');
      assert(u.reset_expires === undefined, 'No reset_expires exposed');
    }
  });

  console.log(`\nSmoke Test Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests();
