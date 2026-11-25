const logger = require('./logger');

/**
 * Structured security audit logger for sensitive actions
 * (admin operations, authz failures, order/payment overrides, webhook rejections).
 * Never logs raw tokens, passwords, or secrets.
 */
const auditLog = (event, { actor = null, ip = null, target = null, outcome = 'success', details = {} } = {}) => {
  const entry = {
    type: 'SECURITY_AUDIT',
    event,
    outcome,
    timestamp: new Date().toISOString(),
    actor: actor ? { uid: actor.uid || null, email: actor.email || null } : 'anonymous',
    ip: ip || null,
    target: target || null,
    details
  };

  if (outcome === 'denied' || outcome === 'failed') {
    logger.warn(`[AUDIT] ${event}: ${JSON.stringify(entry)}`);
  } else {
    logger.info(`[AUDIT] ${event}: ${JSON.stringify(entry)}`);
  }
};

module.exports = { auditLog };
