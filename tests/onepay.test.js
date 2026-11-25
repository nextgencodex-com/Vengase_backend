jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/models/Order', () => ({ findById: jest.fn(), confirmOnepayPayment: jest.fn() }));
jest.mock('../src/utils/emailService', () => ({ sendOrderConfirmationEmails: jest.fn() }));
jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../config/firebase', () => ({ getFirestore: jest.fn() }));
const Order = require('../src/models/Order');
const axios = require('axios');
const { getFirestore } = require('../config/firebase');
const { sendOrderConfirmationEmails } = require('../src/utils/emailService');
const controller = require('../src/controllers/paymentController');
let order, update;
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const verify = async (payload = {}) => {
  const res = response();
  await controller.verifyOnepayPayment({ query: {}, body: { order_id: 'ORD-1', ...payload } }, res);
  return res;
};
beforeEach(() => {
  jest.clearAllMocks();
  process.env.ONEPAY_APP_ID = 'test-app';
  process.env.ONEPAY_APP_TOKEN = 'test-app-token';
  process.env.ONEPAY_HASH_SALT = 'test-salt';
  process.env.FRONTEND_URL = 'https://example.com';
  order = { orderId: 'ORD-1', paymentMethod: 'onepay', paymentStatus: 'pending', orderStatus: 'pending', totalAmount: 1200, userEmail: 'buyer@example.com', phone: '+94 0771234567', paymentMeta: { onepay_transaction_id: 'TX-1' } };
  Order.findById.mockImplementation(async () => order);
  update = jest.fn().mockResolvedValue();
  const collection = { doc: () => ({ get: async () => ({ exists: true }), update }), where: () => ({ limit: () => ({ get: async () => ({ empty: false, docs: [{ data: () => order }] }) }) }) };
  getFirestore.mockReturnValue({ collection: () => collection });
  axios.post.mockResolvedValue({ data: { status: 200, data: { status: true, ipg_transaction_id: 'TX-1', amount: 1200, currency: 'LKR' } } });
});
test('verified payment updates order and triggers the shared customer/admin emails', async () => {
  const res = await verify();
  expect(axios.post.mock.calls[0][1]).toEqual({ app_id: 'test-app', onepay_transaction_id: 'TX-1' });
  expect(Order.confirmOnepayPayment).toHaveBeenCalledWith('ORD-1', 'TX-1');
  expect(sendOrderConfirmationEmails).toHaveBeenCalledWith('ORD-1');
  expect(res.json).toHaveBeenCalledWith({ success: true, payment_status: 'paid' });
});
test.each([
  { status: 200, data: { status: false } },
  { success: true, status: 200 },
  { data: { status: true, ipg_transaction_id: 'OTHER', amount: 1200, currency: 'LKR' } },
  { data: { status: true, ipg_transaction_id: 'TX-1', amount: 1, currency: 'LKR' } },
  { data: { status: true, ipg_transaction_id: 'TX-1', amount: 1200, currency: 'USD' } }
])('does not fulfill an unpaid or mismatched transaction: %j', async data => {
  axios.post.mockResolvedValue({ data });
  await verify();
  expect(Order.confirmOnepayPayment).not.toHaveBeenCalled();
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
});
test('rejects a browser transaction belonging to another order', async () => {
  await verify({ transaction_id: 'OTHER' });
  expect(axios.post).not.toHaveBeenCalled();
  expect(Order.confirmOnepayPayment).not.toHaveBeenCalled();
});
test('webhook verifies stored transaction even without order metadata', async () => {
  const res = response();
  await controller.onepayCallback({ body: { transaction_id: 'TX-1', status: 1 }, query: {} }, res);
  expect(Order.confirmOnepayPayment).toHaveBeenCalledWith('ORD-1', 'TX-1');
  expect(sendOrderConfirmationEmails).toHaveBeenCalledWith('ORD-1');
});
test('forged success callback cannot mark an unpaid transaction paid', async () => {
  axios.post.mockResolvedValue({ data: { status: 200, data: { status: false } } });
  await controller.onepayCallback({ body: { transaction_id: 'TX-1', status: 1 }, query: {} }, response());
  expect(Order.confirmOnepayPayment).not.toHaveBeenCalled();
});
test('gateway outage returns a retryable callback error', async () => {
  axios.post.mockRejectedValueOnce(new Error('timeout'));
  const res = response();
  await controller.onepayCallback({ body: { transaction_id: 'TX-1' }, query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(503);
});
test('already paid order retries emails without resetting fulfillment', async () => {
  order.paymentStatus = 'paid';
  order.orderStatus = 'shipped';
  await verify();
  expect(Order.confirmOnepayPayment).not.toHaveBeenCalled();
  expect(sendOrderConfirmationEmails).toHaveBeenCalledWith('ORD-1');
});
test('checkout uses saved amount and persists transaction before returning URL', async () => {
  axios.post.mockResolvedValue({ data: { data: { gateway_url: 'https://checkout.onepay.lk/test', ipg_transaction_id: 'TX-2' } } });
  const res = response();
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1', amount: 1, customerDetails: { firstName: 'Test' } } }, res);
  expect(axios.post.mock.calls[0][1]).toMatchObject({ amount: '1200.00', customer_email: 'buyer@example.com', customer_phone_number: '+94771234567', additionalData: '{"order_id":"ORD-1"}' });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ paymentMeta: expect.objectContaining({ onepay_transaction_id: 'TX-2' }) }));
  expect(res.status).toHaveBeenCalledWith(200);
});
test('checkout does not redirect when saving transaction fails', async () => {
  axios.post.mockResolvedValue({ data: { data: { gateway_url: 'https://checkout.onepay.lk/test', ipg_transaction_id: 'TX-2' } } });
  update.mockRejectedValue(new Error('offline'));
  const res = response();
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1' } }, res);
  expect(res.status).toHaveBeenCalledWith(500);
});

// Check the request contract, not just mocked payment success.
test('checkout matches the official SDK amount and hash format', async () => {
  axios.post.mockResolvedValue({ data: { data: { gateway_url: 'https://checkout.onepay.lk/test', ipg_transaction_id: 'TX-2' } } });
  order.totalAmount = 1200.5;
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1' } }, response());
  const payload = axios.post.mock.calls[0][1];
  expect(payload.amount).toBe('1200.50');
  expect(payload.hash).toBe(require('crypto').createHash('sha256').update('test-appLKR1200.50test-salt').digest('hex'));
  expect(payload).not.toHaveProperty('order_reference');
});
test.each(['94771234567', '0094771234567', '0771234567', '+94 0771234567'])('normalizes phone %s for OnePay', async phone => {
  order.phone = phone;
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1' } }, response());
  expect(axios.post.mock.calls[0][1].customer_phone_number).toBe('+94771234567');
});
test.each([['phone', '123'], ['userEmail', 'invalid']])('rejects invalid %s before calling OnePay', async (field, value) => {
  order[field] = value;
  const res = response();
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1' } }, res);
  expect(res.status).toHaveBeenCalledWith(422);
  expect(axios.post).not.toHaveBeenCalled();
});
test('rejects a non-HTTPS storefront return URL before calling OnePay', async () => {
  process.env.FRONTEND_URL = 'http://localhost:5173';
  const res = response();
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1' } }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(axios.post).not.toHaveBeenCalled();
});
test.each([true, false])('identifies upstream rejection (HTTP error: %s)', async httpError => {
  const rejection = { status: 400, data: { status: 400, message: 'Invalid request data', errors: { amount: ['Invalid amount'] } } };
  if (httpError) axios.post.mockRejectedValueOnce(Object.assign(new Error('Request failed'), { response: rejection }));
  else axios.post.mockResolvedValueOnce({ ...rejection, status: 200 });
  const res = response();
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1' } }, res);
  expect(res.status).toHaveBeenCalledWith(502);
  expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid request data', code: 'ONEPAY_CHECKOUT_REJECTED' });
  expect(update).not.toHaveBeenCalled();
});

test('official nested gateway response produces a saved checkout URL with raw token authorization', async () => {
  axios.post.mockResolvedValueOnce({ data: { status: 200, data: { ipg_transaction_id: 'TX-OFFICIAL', gateway: { redirect_url: 'https://checkout.onepay.lk/official' } } } });
  const res = response();
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1' } }, res);
  expect(axios.post.mock.calls[0][2].headers).toEqual({ Authorization: 'test-app-token', 'Content-Type': 'application/json', Accept: 'application/json' });
  expect(res.json).toHaveBeenCalledWith({ success: true, url: 'https://checkout.onepay.lk/official', transaction_id: 'TX-OFFICIAL', order_id: 'ORD-1' });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ paymentMeta: expect.objectContaining({ onepay_transaction_id: 'TX-OFFICIAL' }) }));
});
test('status verification also passes the configured app token without adding Bearer', async () => {
  await verify();
  expect(axios.post.mock.calls[0][2].headers.Authorization).toBe('test-app-token');
});
test('missing app token stops checkout before calling OnePay', async () => {
  delete process.env.ONEPAY_APP_TOKEN;
  const res = response();
  await controller.generateOnepayPayload({ body: { orderId: 'ORD-1' } }, res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(axios.post).not.toHaveBeenCalled();
});
