const cron = require('node-cron');
const pool = require('../db');
const { generateDueInvoices } = require('./billing');

function start() {
  if (process.env.ENABLE_SCHEDULER === 'false') {
    console.log('[Scheduler] Skipped: ENABLE_SCHEDULER is false');
    return null;
  }

  const job = cron.schedule('0 1 * * *', async () => {
    try {
      let autoClosedCount = 0;
      try {
        const subRules = require('./subscriptionRules');
        if (subRules && typeof subRules.runAutoClose === 'function') {
          const res = await subRules.runAutoClose(pool);
          autoClosedCount = res?.closedCount || 0;
        }
      } catch (err) {
        console.error('[Scheduler] Auto-close failed:', err.message);
      }

      const summary = await generateDueInvoices();
      console.log(`[Scheduler] Billing run summary: auto_closed=${autoClosedCount}, created=${summary.created}, skipped_existing=${summary.skipped_existing}, failed=${summary.failed}`);
    } catch (err) {
      console.error('[Scheduler] Daily run failed:', err.message);
    }
  });

  console.log('[Scheduler] Started: running daily at 01:00');
  return job;
}

module.exports = { start };
