const logger = require('../utils/logger');
const { getFirestore } = require('../../config/firebase');
const { reconcileMintpayOrder } = require('../controllers/paymentController');

// Mintpay has no webhook. If a customer pays and closes the tab before the redirect,
// nothing would ever confirm the order, so we poll Mintpay for recent unpaid orders.
const INTERVAL_MS = Number(process.env.MINTPAY_RECONCILE_INTERVAL_MS) || 5 * 60 * 1000;
const MAX_AGE_MS = Number(process.env.MINTPAY_RECONCILE_MAX_AGE_HOURS || 72) * 60 * 60 * 1000;
const MIN_AGE_MS = 2 * 60 * 1000; // give the browser return a chance to settle it first

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value._seconds || value.seconds) return (value._seconds || value.seconds) * 1000;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

let running = false;

const reconcilePendingMintpayOrders = async (now = Date.now()) => {
  if (running) return { skipped: true };
  running = true;
  const summary = { checked: 0, paid: 0, review: 0, errors: 0 };
  try {
    // Two equality/in filters: served by single-field indexes, no composite index needed.
    // 'failed' is included because older code wrongly failed still-pending Mintpay purchases.
    const snapshot = await getFirestore().collection('orders')
      .where('paymentMethod', '==', 'mintpay')
      .where('paymentStatus', 'in', ['pending', 'failed'])
      .get();

    for (const doc of snapshot.docs) {
      const order = doc.data();
      const age = now - toMillis(order.paymentMeta?.submitted_at || order.createdAt);
      if (order.paymentReviewRequired || order.orderStatus === 'cancelled') continue;
      if (!order.paymentMeta?.mintpay_purchase_id || age < MIN_AGE_MS || age > MAX_AGE_MS) continue;

      summary.checked++;
      try {
        const result = await reconcileMintpayOrder({ ...order, orderId: order.orderId || doc.id });
        if (result.payment_status === 'paid') summary.paid++;
        if (result.review_required) summary.review++;
      } catch (err) {
        summary.errors++;
        logger.warn(`[MintpayReconciler] Order ${order.orderId || doc.id} check failed: ${err.message}`);
      }
    }
    if (summary.checked) logger.info(`[MintpayReconciler] ${JSON.stringify(summary)}`);
    return summary;
  } catch (err) {
    logger.error(`[MintpayReconciler] Run failed: ${err.message}`);
    return { ...summary, failed: true };
  } finally {
    running = false;
  }
};

const startMintpayReconciler = () => {
  if (!process.env.MINTPAY_MERCHANT_ID || !process.env.MINTPAY_API_TOKEN) {
    logger.warn('[MintpayReconciler] Mintpay not configured; reconciler not started');
    return null;
  }
  logger.info(`[MintpayReconciler] Checking unpaid Mintpay orders every ${Math.round(INTERVAL_MS / 1000)}s`);
  const timer = setInterval(reconcilePendingMintpayOrders, INTERVAL_MS);
  timer.unref();
  setTimeout(reconcilePendingMintpayOrders, 30 * 1000).unref();
  return timer;
};

module.exports = { reconcilePendingMintpayOrders, startMintpayReconciler };
