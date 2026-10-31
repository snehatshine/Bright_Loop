const ALLOWED_TRANSITIONS = {
  draft: 'quotation',
  quotation: 'confirmed',
  confirmed: 'active',
  active: 'closed'
};

const PERIOD_INTERVALS = {
  daily: '1 day',
  weekly: '1 week',
  monthly: '1 month',
  yearly: '1 year'
};

/**
 * Validates state transition forward flow and plan rules.
 */
function validateTransition(currentStatus, targetStatus, plan, subscription) {
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowedNext || allowedNext !== targetStatus) {
    return {
      valid: false,
      error: `Invalid transition from '${currentStatus}' to '${targetStatus}'. Allowed next status: '${allowedNext || 'none (terminal state)'}'`
    };
  }

  // Closing from active before expiry date requires plan.closable = true
  if (currentStatus === 'active' && targetStatus === 'closed') {
    if (subscription.expiry_date) {
      const today = new Date().toISOString().slice(0, 10);
      const expiry = new Date(subscription.expiry_date).toISOString().slice(0, 10);
      if (today < expiry && !plan.closable) {
        return {
          valid: false,
          error: 'Cannot close active subscription before expiry date: plan is not closable'
        };
      }
    } else if (!plan.closable) {
      // If no expiry date set, closing early is also guarded by plan.closable
      return {
        valid: false,
        error: 'Cannot close active subscription before expiry date: plan is not closable'
      };
    }
  }

  return { valid: true };
}

/**
 * Runs auto-close on active subscriptions whose plan has auto_close = true and expiry_date < CURRENT_DATE.
 */
async function runAutoClose(poolOrClient) {
  const { rows } = await poolOrClient.query(
    `UPDATE subscriptions s
     SET status = 'closed'
     FROM plans p
     WHERE s.plan_id = p.id
       AND p.auto_close = true
       AND s.status = 'active'
       AND s.expiry_date < CURRENT_DATE
     RETURNING s.id`
  );
  return { closedCount: rows.length, closedIds: rows.map(r => r.id) };
}

module.exports = {
  ALLOWED_TRANSITIONS,
  PERIOD_INTERVALS,
  validateTransition,
  runAutoClose
};
