jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/models/Order', () => ({ create: jest.fn(), findById: jest.fn(), updatePaymentStatus: jest.fn(), updateOrderStatus: jest.fn(), markPaymentPaid: jest.fn(), markPaymentFailed: jest.fn(), flagPaymentReview: jest.fn() }));
jest.mock('../src/models/PromoCode', () => ({}));
jest.mock('../src/utils/emailService', () => ({ sendOrderConfirmationEmails: jest.fn() }));
jest.mock('axios', () => ({ get: jest.fn() }));
const crypto = require('crypto');
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.WEBXPAY_PUBLIC_KEY = keys.publicKey.export({ type: 'spki', format: 'pem' });
process.env.WEBXPAY_SECRET_KEY = 'test-webx';
process.env.PAYZY_SECRET_KEY = 'test-payzy';
process.env.MINTPAY_MERCHANT_ID = 'test-merchant';
process.env.MINTPAY_API_TOKEN = 'test-token';
const Order = require('../src/models/Order');
const axios = require('axios');
const { sendOrderConfirmationEmails } = require('../src/utils/emailService');
const payments = require('../src/controllers/paymentController');
const { createOrder } = require('../src/controllers/orderController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), redirect: jest.fn() });
beforeEach(() => {
  jest.clearAllMocks();
  Order.create.mockImplementation(async data => ({ ...data, orderId: 'ORD-1', paymentStatus: 'pending' }));
  Order.findById.mockResolvedValue({ orderId: 'ORD-1', totalAmount: 1000, paymentMeta: { mintpay_purchase_id: 'PURCHASE-1' } });
});
test.each(['cod', 'cash_on_delivery', ' COD '])('%s sends confirmations immediately after saving the order, without payment', async paymentMethod => {
  const res = response();
  const next = jest.fn();
  await createOrder({ body: { paymentMethod, totalAmount: 1000, userEmail: 'buyer@example.com' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(sendOrderConfirmationEmails).toHaveBeenCalledWith('ORD-1');
  expect(Order.create.mock.invocationCallOrder[0]).toBeLessThan(sendOrderConfirmationEmails.mock.invocationCallOrder[0]);
  expect(Order.updatePaymentStatus).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
});
test('failed COD order creation sends no confirmation', async () => {
  Order.create.mockRejectedValueOnce(new Error('Database unavailable'));
  const next = jest.fn();
  await createOrder({ body: { paymentMethod: 'cod', totalAmount: 1000 } }, response(), next);
  expect(next).toHaveBeenCalled();
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
});
test.each(['card', 'payzy', 'mintpay', 'onepay'])('%s does not send emails when the unpaid order is created', async paymentMethod => {
  await createOrder({ body: { paymentMethod, totalAmount: 1000 } }, response(), jest.fn());
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
});
test.each([['00', true], ['05', false]])('WebXPay encrypted result %s triggers emails only for success', async (code, paid) => {
  const payment = crypto.privateEncrypt({ key: keys.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(`ORD-1|REF|2026-09-19|${code}|Result|card`)).toString('base64');
  await payments.paymentCallback({ body: { payment, secret_key: 'test-webx' } }, response());
  expect(sendOrderConfirmationEmails).toHaveBeenCalledTimes(paid ? 1 : 0);
  expect(paid ? Order.markPaymentPaid : Order.markPaymentFailed).toHaveBeenCalledWith('ORD-1');
  if (paid) expect(Order.markPaymentPaid.mock.invocationCallOrder[0]).toBeLessThan(sendOrderConfirmationEmails.mock.invocationCallOrder[0]);
});
test('WebXPay failed result with a not-approved comment must not send confirmation', async () => {
  await payments.paymentCallback({ body: { order_id: 'ORD-1', status_code: '05', comment: 'Payment not approved', secret_key: 'test-webx' } }, response());
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
});
test('WebXPay numeric zero success code sends confirmation', async () => {
  const payment = crypto.privateEncrypt({ key: keys.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from('ORD-1|REF|2026-09-19|0|Approved|card')).toString('base64');
  await payments.paymentCallback({ body: { payment, secret_key: 'test-webx' } }, response());
  expect(sendOrderConfirmationEmails).toHaveBeenCalledWith('ORD-1');
});
test('WebXPay success text without a result code does not send confirmation', async () => {
  await payments.paymentCallback({ body: { order_id: 'ORD-1', comment: 'successful', secret_key: 'test-webx' } }, response());
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
});
test.each([['00', true], ['05', false]])('Payzy signed result %s triggers emails only for success', async (code, paid) => {
  const fields = 'x_test_mode,x_shopid,x_amount,x_order_id,x_response_url,x_first_name,x_last_name,x_company,x_address,x_country,x_state,x_city,x_zip,x_phone,x_email,x_ship_to_first_name,x_ship_to_last_name,x_ship_to_company,x_ship_to_address,x_ship_to_country,x_ship_to_state,x_ship_to_city,x_ship_to_zip,x_freight,x_platform,x_version'.split(',');
  const meta = Object.fromEntries(fields.map(field => [field, '']));
  Object.assign(meta, { x_order_id: 'ORD-1', x_amount: '1000.00' });
  Order.findById.mockResolvedValue({ orderId: 'ORD-1', paymentMeta: meta });
  const signedFields = ['response_code', ...fields, 'signed_field_names'].join(',');
  const message = [`response_code=${code}`, ...fields.map(field => `${field}=${meta[field]}`), `signed_field_names=${signedFields}`].join(',');
  const signature = crypto.createHmac('sha256', 'test-payzy').update(message).digest('base64');
  const res = response();
  await payments.verifyPayzyPayment({ body: { x_order_id: 'ORD-1', response_code: code, signature } }, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(sendOrderConfirmationEmails).toHaveBeenCalledTimes(paid ? 1 : 0);
  expect(paid ? Order.markPaymentPaid : Order.markPaymentFailed).toHaveBeenCalledWith('ORD-1');
});
test('Payzy invalid signature does not send emails', async () => {
  Order.findById.mockResolvedValue({ orderId: 'ORD-1', paymentMeta: {} });
  await payments.verifyPayzyPayment({ body: { x_order_id: 'ORD-1', response_code: '00', signature: 'invalid' } }, response());
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
});
test.each([['Approved', 'paid'], ['Rejected', 'pending'], ['declined', 'pending'], ['pending', 'pending']])('Mintpay status %s -> %s, emails only for approval, never marks failed', async (status, expected) => {
  axios.get.mockResolvedValue({ status: 200, data: { data: { status, total_price: '1000.0000' } } });
  const res = response();
  await payments.verifyMintpayPayment({ body: { order_id: 'ORD-1' } }, res);
  expect(sendOrderConfirmationEmails).toHaveBeenCalledTimes(expected === 'paid' ? 1 : 0);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ payment_status: expected }));
  expect(Order.markPaymentPaid).toHaveBeenCalledTimes(expected === 'paid' ? 1 : 0);
  expect(Order.markPaymentFailed).not.toHaveBeenCalled();
  expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/status-purchase\/$/), expect.objectContaining({ params: expect.objectContaining({ purchase_id: 'PURCHASE-1' }) }));
});
test.each([['999.00'], [undefined]])('Mintpay approved with wrong/missing amount %s is flagged for review, not paid', async (total_price) => {
  axios.get.mockResolvedValue({ status: 200, data: { data: { status: 'Approved', total_price } } });
  const res = response();
  await payments.verifyMintpayPayment({ body: { order_id: 'ORD-1' } }, res);
  expect(Order.markPaymentPaid).not.toHaveBeenCalled();
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
  expect(Order.flagPaymentReview).toHaveBeenCalledWith('ORD-1', expect.any(String));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ payment_status: 'pending', review_required: true }));
});
test('Mintpay rejects a client purchase_id that does not match the stored one', async () => {
  const res = response();
  await payments.verifyMintpayPayment({ body: { order_id: 'ORD-1', purchase_id: 'OTHER-PAID-PURCHASE' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(axios.get).not.toHaveBeenCalled();
  expect(Order.markPaymentPaid).not.toHaveBeenCalled();
});
test('Mintpay on an already-paid order resends missing emails without calling the gateway', async () => {
  Order.findById.mockResolvedValue({ orderId: 'ORD-1', paymentStatus: 'paid', paymentMeta: { mintpay_purchase_id: 'PURCHASE-1' } });
  const res = response();
  await payments.verifyMintpayPayment({ body: { order_id: 'ORD-1' } }, res);
  expect(axios.get).not.toHaveBeenCalled();
  expect(sendOrderConfirmationEmails).toHaveBeenCalledWith('ORD-1');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ payment_status: 'paid' }));
});
