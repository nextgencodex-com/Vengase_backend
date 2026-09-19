jest.mock('../config/firebase', () => ({ getFirestore: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const { getFirestore } = require('../config/firebase');
const Order = require('../src/models/Order');
test.each(['pending', 'shipped', 'delivered', 'cancelled'])('paid OnePay order is visible in admin listing; preserves %s fulfillment', async status => {
  const order = { orderId: 'ORD-1', paymentMethod: 'onepay', paymentStatus: 'pending', orderStatus: status, totalAmount: 1200, paymentMeta: { onepay_transaction_id: 'TX-1' } };
  const doc = { exists: true, data: () => order };
  const ref = { get: async () => doc };
  const snapshot = { forEach: fn => fn(doc) };
  const collection = { doc: () => ref, get: async () => snapshot, orderBy: () => ({ get: async () => snapshot }) };
  const transaction = { get: async () => doc, update: jest.fn((ref, values) => Object.assign(order, values)) };
  getFirestore.mockReturnValue({ collection: () => collection, runTransaction: async fn => fn(transaction) });
  await Order.confirmOnepayPayment('ORD-1', 'TX-1');
  await Order.confirmOnepayPayment('ORD-1', 'TX-1');
  expect(transaction.update).toHaveBeenCalledTimes(1);
  expect((await Order.findAll())[0]).toMatchObject({ paymentMethod: 'onepay', paymentStatus: 'paid', orderStatus: status === 'pending' ? 'confirmed' : status });
  expect((await Order.getStats()).totalRevenue).toBe(1200);
});
