const pg = require('pg');
const pool = require('../db');

pg.types.setTypeParser(1082, str => str);

/**
 * Money utilities:
 * Amounts are represented as integer cents during all intermediate math.
 * Standard round-half-up is used for rounding fractional cents.
 * Money is returned / stored formatted as a string with 2 decimal places.
 */
function toCents(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return Math.round(val * 100);
  const s = String(val).trim();
  const negative = s.startsWith('-');
  const clean = negative ? s.slice(1) : s;
  const parts = clean.split('.');
  const whole = parseInt(parts[0], 10) || 0;
  const frac = parts[1] || '';
  const frac2 = (frac + '00').slice(0, 2);
  const extra = frac.length > 2 ? Number('0.' + frac.slice(2)) : 0;
  let cents = whole * 100 + parseInt(frac2, 10);
  if (extra >= 0.5) cents += 1;
  return negative ? -cents : cents;
}

function fromCents(cents) {
  const isNeg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${isNeg ? '-' : ''}${whole}.${String(rem).padStart(2, '0')}`;
}

/**
 * Date math utilities on UTC date strings (YYYY-MM-DD), never local-time Date objects.
 */
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function addPeriod(dateStr, period) {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (period === 'daily') {
    return addDays(dateStr, 1);
  }
  if (period === 'weekly') {
    return addDays(dateStr, 7);
  }
  if (period === 'monthly') {
    let targetY = y;
    let targetM = m + 1;
    if (targetM > 12) {
      targetY += 1;
      targetM = 1;
    }
    const maxDays = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
    const targetD = Math.min(d, maxDays);
    return `${targetY}-${String(targetM).padStart(2, '0')}-${String(targetD).padStart(2, '0')}`;
  }
  if (period === 'yearly') {
    let targetY = y + 1;
    let targetM = m;
    const maxDays = new Date(Date.UTC(targetY, targetM, 0)).getUTCDate();
    const targetD = Math.min(d, maxDays);
    return `${targetY}-${String(targetM).padStart(2, '0')}-${String(targetD).padStart(2, '0')}`;
  }
  throw new Error(`Unknown billing period: ${period}`);
}

/**
 * Generates due invoices for active subscriptions.
 * Idempotent: safe against concurrent runs and duplicate generation.
 */
async function generateDueInvoices({ today = new Date().toISOString().slice(0, 10) } = {}) {
  let created = 0;
  let skipped_existing = 0;
  let failed = 0;
  const errors = [];
  const processedSubIds = new Set();

  while (true) {
    // 1. Select candidate due subscriptions in batches of 200
    const excludeIds = Array.from(processedSubIds);
    const subQuery = `
      SELECT s.id
      FROM subscriptions s
      WHERE s.status = 'active'
        AND s.paused = false
        AND s.next_invoice_date <= $1
        AND (s.expiry_date IS NULL OR s.next_invoice_date <= s.expiry_date)
        ${excludeIds.length > 0 ? `AND s.id NOT IN (${excludeIds.join(',')})` : ''}
      ORDER BY s.id ASC
      LIMIT 200
    `;
    const { rows: batchCandidates } = await pool.query(subQuery, [today]);
    if (batchCandidates.length === 0) break;

    const candidateIds = batchCandidates.map(r => r.id);
    for (const id of candidateIds) {
      processedSubIds.add(id);
    }

    // 10. Fetch lines for the entire batch in ONE query (no per-subscription query for reads)
    const { rows: allBatchLines } = await pool.query(
      `SELECT l.*, p.name AS product_name, v.value AS variant_value, t.rate_percent AS tax_rate
       FROM subscription_lines l
       JOIN products p ON l.product_id = p.id
       LEFT JOIN variants v ON l.variant_id = v.id
       LEFT JOIN taxes t ON l.tax_id = t.id
       WHERE l.subscription_id = ANY($1)
       ORDER BY l.id ASC`,
      [candidateIds]
    );

    const batchLinesMap = new Map();
    for (const line of allBatchLines) {
      const subId = String(line.subscription_id);
      if (!batchLinesMap.has(subId)) batchLinesMap.set(subId, []);
      batchLinesMap.get(subId).push(line);
    }

    // 2. Process EACH subscription in its OWN transaction.
    for (const subId of candidateIds) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock subscription with FOR UPDATE SKIP LOCKED
        const { rows: lockedRows } = await client.query(
          `SELECT s.*, p.period, p.name AS plan_name
           FROM subscriptions s
           JOIN plans p ON s.plan_id = p.id
           WHERE s.id = $1
             AND s.status = 'active'
             AND s.paused = false
             AND s.next_invoice_date <= $2
             AND (s.expiry_date IS NULL OR s.next_invoice_date <= s.expiry_date)
           FOR UPDATE SKIP LOCKED`,
          [subId, today]
        );

        if (lockedRows.length === 0) {
          // Locked by another concurrent run or no longer eligible
          await client.query('ROLLBACK');
          continue;
        }

        const sub = lockedRows[0];
        const subLines = batchLinesMap.get(String(subId)) || [];
        if (subLines.length === 0) {
          throw new Error(`Subscription ${subId} has no subscription lines`);
        }

        // 9. Catch up missed periods: loop while next_invoice_date <= today (and <= expiry),
        // up to 12 periods per subscription per run
        let periodsProcessed = 0;
        let currentDate = sub.next_invoice_date;

        while (
          currentDate <= today &&
          (!sub.expiry_date || currentDate <= sub.expiry_date) &&
          periodsProcessed < 12
        ) {
          periodsProcessed++;

          // 3. period_start = next_invoice_date. period_end = period_start + one plan period minus 1 day.
          const periodStart = currentDate;
          const nextPeriodDate = addPeriod(periodStart, sub.period);
          const periodEnd = addDays(nextPeriodDate, -1);
          const nextInvoiceDate = nextPeriodDate;
          const dueDate = addDays(periodStart, sub.payment_terms_days);

          // 5. Prepare subscription lines
          let subtotalCents = 0;
          let totalQuantity = 0;
          const positiveLines = subLines.map(line => {
            const description = line.variant_value
              ? `${line.product_name} - ${line.variant_value}`
              : line.product_name;
            const quantity = Number(line.quantity);
            const unitPriceCents = toCents(line.unit_price);
            const lineAmountCents = quantity * unitPriceCents;
            const taxPercent = line.tax_rate != null ? Number(line.tax_rate) : 0;

            subtotalCents += lineAmountCents;
            totalQuantity += quantity;

            return {
              product_id: line.product_id,
              description,
              quantity,
              unit_price_cents: unitPriceCents,
              amount_cents: lineAmountCents,
              tax_percent: taxPercent
            };
          });

          // 6. Automatically apply eligible discounts
          // Find discounts where start_date <= today <= end_date AND (usage_limit is null OR times_used < usage_limit)
          const { rows: candidateDiscounts } = await client.query(
            `SELECT * FROM discounts
             WHERE start_date <= $1 AND end_date >= $1
               AND (usage_limit IS NULL OR times_used < usage_limit)
             ORDER BY id ASC`,
            [today]
          );

          const appliedDiscounts = [];
          let currentDiscountTotalCents = 0;

          for (const d of candidateDiscounts) {
            // Check threshold conditions
            if (subtotalCents < toCents(d.min_purchase)) continue;
            if (totalQuantity < d.min_quantity) continue;

            let applicableAmountCents = 0;
            if (d.scope === 'product') {
              for (const pl of positiveLines) {
                if (String(pl.product_id) === String(d.product_id)) {
                  applicableAmountCents += pl.amount_cents;
                }
              }
            } else {
              applicableAmountCents = subtotalCents;
            }

            if (applicableAmountCents <= 0) continue;

            let discountAmountCents = 0;
            if (d.type === 'fixed') {
              discountAmountCents = Math.min(toCents(d.value), applicableAmountCents);
            } else if (d.type === 'percentage') {
              discountAmountCents = Math.round((applicableAmountCents * Number(d.value)) / 100);
            }

            // Total discount can never exceed the subtotal
            const maxAllowedCents = Math.max(0, subtotalCents - currentDiscountTotalCents);
            discountAmountCents = Math.min(discountAmountCents, maxAllowedCents);

            if (discountAmountCents <= 0) continue;

            // Claim usage atomically
            const claimRes = await client.query(
              `UPDATE discounts
               SET times_used = times_used + 1
               WHERE id = $1 AND (usage_limit IS NULL OR times_used < usage_limit)
               RETURNING id`,
              [d.id]
            );

            if (claimRes.rowCount === 0) {
              // Usage limit was reached concurrently
              continue;
            }

            currentDiscountTotalCents += discountAmountCents;
            appliedDiscounts.push({
              discount_id: d.id,
              name: d.name,
              scope: d.scope,
              product_id: d.product_id,
              amount_cents: discountAmountCents
            });

            if (currentDiscountTotalCents >= subtotalCents) break;
          }

          /**
           * 7. Totals and Discount Spreading:
           * How discounts are spread across lines:
           * --------------------------------------
           * 1. Each positive line tracks its allocated discount in cents (allocatedDiscountCents), initialized to 0.
           * 2. For each applied discount:
           *    - If scope is 'product': The discount is apportioned among the lines matching that product_id
           *      in proportion to each matching line's amount:
           *        lineShare = round(discountAmount * line.amount / totalMatchingAmount)
           *      Any rounding remainder is added to the last matching line to ensure the sum of shares exactly equals the discount.
           *    - If scope is 'subscription': The discount is apportioned across ALL positive lines
           *      in proportion to each line's amount:
           *        lineShare = round(discountAmount * line.amount / subtotal)
           *      Any rounding remainder is added to the last line to ensure exact distribution.
           * 3. For each positive line, its taxable base is:
           *      taxableAmount = max(0, line.amount - line.allocatedDiscount)
           *    Line tax in cents is calculated using round-half-up:
           *      lineTax = round(taxableAmount * line.tax_percent / 100)
           * 4. Overall totals:
           *      subtotal = sum of positive lines
           *      discount_total = sum of applied discounts
           *      tax_total = sum of line taxes
           *      total = subtotal - discount_total + tax_total
           */
          const lineDiscounts = new Array(positiveLines.length).fill(0);

          for (const ad of appliedDiscounts) {
            if (ad.scope === 'product') {
              const matchingIndices = [];
              let matchingTotalCents = 0;
              for (let i = 0; i < positiveLines.length; i++) {
                if (String(positiveLines[i].product_id) === String(ad.product_id)) {
                  matchingIndices.push(i);
                  matchingTotalCents += positiveLines[i].amount_cents;
                }
              }

              if (matchingTotalCents > 0) {
                let allocatedSoFar = 0;
                for (let k = 0; k < matchingIndices.length; k++) {
                  const idx = matchingIndices[k];
                  const isLast = k === matchingIndices.length - 1;
                  const share = isLast
                    ? ad.amount_cents - allocatedSoFar
                    : Math.round((ad.amount_cents * positiveLines[idx].amount_cents) / matchingTotalCents);
                  lineDiscounts[idx] += share;
                  allocatedSoFar += share;
                }
              }
            } else {
              // subscription-scoped discount spread over all positive lines
              let allocatedSoFar = 0;
              for (let i = 0; i < positiveLines.length; i++) {
                const isLast = i === positiveLines.length - 1;
                const share = isLast
                  ? ad.amount_cents - allocatedSoFar
                  : Math.round((ad.amount_cents * positiveLines[i].amount_cents) / subtotalCents);
                lineDiscounts[i] += share;
                allocatedSoFar += share;
              }
            }
          }

          let taxTotalCents = 0;
          for (let i = 0; i < positiveLines.length; i++) {
            const line = positiveLines[i];
            const taxableCents = Math.max(0, line.amount_cents - lineDiscounts[i]);
            const lineTaxCents = Math.round((taxableCents * line.tax_percent) / 100);
            taxTotalCents += lineTaxCents;
          }

          const discountTotalCents = currentDiscountTotalCents;
          const totalCents = subtotalCents - discountTotalCents + taxTotalCents;

          // 4. Insert invoice with ON CONFLICT (subscription_id, period_start) DO NOTHING RETURNING id
          const insertInvoiceRes = await client.query(
            `INSERT INTO invoices
               (subscription_id, customer_id, period_start, period_end, status,
                subtotal, discount_total, tax_total, total, amount_paid, due_date)
             VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, 0, $9)
             ON CONFLICT (subscription_id, period_start) DO NOTHING
             RETURNING id`,
            [
              sub.id,
              sub.customer_id,
              periodStart,
              periodEnd,
              fromCents(subtotalCents),
              fromCents(discountTotalCents),
              fromCents(taxTotalCents),
              fromCents(totalCents),
              dueDate
            ]
          );

          if (insertInvoiceRes.rows.length === 0) {
            // Invoice already exists for this period; heal pointer and continue
            skipped_existing++;
            currentDate = nextInvoiceDate;
            await client.query(
              'UPDATE subscriptions SET next_invoice_date = $1 WHERE id = $2',
              [currentDate, sub.id]
            );
            continue;
          }

          const invoiceId = insertInvoiceRes.rows[0].id;
          created++;

          // 5. Copy each subscription line into invoice_lines
          for (const line of positiveLines) {
            await client.query(
              `INSERT INTO invoice_lines
                 (invoice_id, description, quantity, unit_price, discount_id, tax_percent, amount)
               VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
              [
                invoiceId,
                line.description,
                line.quantity,
                fromCents(line.unit_price_cents),
                line.tax_percent,
                fromCents(line.amount_cents)
              ]
            );
          }

          // 6. Add negative invoice line per discount with discount_id set, tax_percent 0
          for (const ad of appliedDiscounts) {
            await client.query(
              `INSERT INTO invoice_lines
                 (invoice_id, description, quantity, unit_price, discount_id, tax_percent, amount)
               VALUES ($1, $2, 1, $3, $4, 0, $5)`,
              [
                invoiceId,
                `Discount: ${ad.name}`,
                fromCents(-ad.amount_cents),
                ad.discount_id,
                fromCents(-ad.amount_cents)
              ]
            );
          }

          // Advance pointer
          currentDate = nextInvoiceDate;
          await client.query(
            'UPDATE subscriptions SET next_invoice_date = $1 WHERE id = $2',
            [currentDate, sub.id]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        failed++;
        errors.push({ subscription_id: subId, message: err.message });
      } finally {
        client.release();
      }
    }
  }

  return { created, skipped_existing, failed, errors };
}

module.exports = {
  generateDueInvoices,
  toCents,
  fromCents,
  addDays,
  addPeriod
};
