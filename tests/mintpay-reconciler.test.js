jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/controllers/paymentController', () => ({ reconcileMintpayOrder: jest.fn() }));
const mockDocs = [];
const mockQuery = { where: jest.fn(() => mockQuery), get: jest.fn(async () => ({ docs: mockDocs })) };
jest.mock('../config/firebase', () => ({ getFirestore: () => ({ collection: () => mockQuery }) }));
const { reconcileMintpayOrder } = require('../src/controllers/paymentController');
const { reconcilePendingMintpayOrders } = require('../src/services/mintpayReconciler');

const NOW = Date.parse('2026-11-27T12:00:00Z');
const doc = (id, data) => ({ id, data: () => ({ orderId: id, paymentMethod: 'mintpay', paymentStatus: 'pending', paymentMeta: { mintpay_purchase_id: `P-${id}`, submitted_at: new Date(NOW - 10 * 60 * 1000) }, ...data }) });

beforeEach(() => { jest.clearAllMocks(); mockDocs.length = 0; });

test('checks only eligible unpaid Mintpay orders and counts results', async () => {
  mockDocs.push(
    doc('OK-PAID'),
    doc('OK-PENDING'),
    doc('TOO-NEW', { paymentMeta: { mintpay_purchase_id: 'P', submitted_at: new Date(NOW - 30 * 1000) } }),
    doc('TOO-OLD', { paymentMeta: { mintpay_purchase_id: 'P', submitted_at: new Date(NOW - 10 * 24 * 3600 * 1000) } }),
    doc('NO-PURCHASE', { paymentMeta: {} }),
    doc('REVIEW', { paymentReviewRequired: true }),
    doc('CANCELLED', { orderStatus: 'cancelled' })
  );
  reconcileMintpayOrder.mockImplementation(async (o) => ({ payment_status: o.orderId === 'OK-PAID' ? 'paid' : 'pending' }));
  const summary = await reconcilePendingMintpayOrders(NOW);
  expect(reconcileMintpayOrder.mock.calls.map(([o]) => o.orderId)).toEqual(['OK-PAID', 'OK-PENDING']);
  expect(summary).toMatchObject({ checked: 2, paid: 1, errors: 0 });
  expect(mockQuery.where).toHaveBeenCalledWith('paymentMethod', '==', 'mintpay');
  expect(mockQuery.where).toHaveBeenCalledWith('paymentStatus', 'in', ['pending', 'failed']);
});

test('one failing order does not stop the rest', async () => {
  mockDocs.push(doc('A'), doc('B'));
  reconcileMintpayOrder.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ payment_status: 'paid' });
  const summary = await reconcilePendingMintpayOrders(NOW);
  expect(summary).toMatchObject({ checked: 2, paid: 1, errors: 1 });
});
