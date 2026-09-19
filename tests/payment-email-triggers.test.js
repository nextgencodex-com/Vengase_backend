jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/models/Order', () => ({ create: jest.fn(), findById: jest.fn(), updatePaymentStatus: jest.fn(), updateOrderStatus: jest.fn() }));
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
  Order.findById.mockResolvedValue({ orderId: 'ORD-1', paymentMeta: { mintpay_purchase_id: 'PURCHASE-1' } });
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
  expect(Order.updatePaymentStatus).toHaveBeenCalledWith('ORD-1', paid ? 'paid' : 'failed');
  if (paid) expect(Order.updatePaymentStatus.mock.invocationCallOrder[0]).toBeLessThan(sendOrderConfirmationEmails.mock.invocationCallOrder[0]);
});
test('WebXPay failed result with a not-approved comment must not send confirmation', async () => {
  await payments.paymentCallback({ body: { order_id: 'ORD-1', status_code: '05', comment: 'Payment not approved', secret_key: 'test-webx' } }, response());
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
});
test('WebXPay numeric zero success code sends confirmation', async () => {
  await payments.paymentCallback({ body: { order_id: 'ORD-1', status_code: 0, secret_key: 'test-webx' } }, response());
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
  expect(Order.updatePaymentStatus).toHaveBeenCalledWith('ORD-1', paid ? 'paid' : 'failed');
});
test('Payzy invalid signature does not send emails', async () => {
  Order.findById.mockResolvedValue({ orderId: 'ORD-1', paymentMeta: {} });
  await payments.verifyPayzyPayment({ body: { x_order_id: 'ORD-1', response_code: '00', signature: 'invalid' } }, response());
  expect(sendOrderConfirmationEmails).not.toHaveBeenCalled();
});
test.each([['approved', true], ['declined', false], ['pending', false]])('Mintpay status %s triggers emails only for approval', async (status, paid) => {
  axios.get.mockResolvedValue({ data: { data: { status } } });
  await payments.verifyMintpayPayment({ body: { order_id: 'ORD-1' } }, response());
  expect(sendOrderConfirmationEmails).toHaveBeenCalledTimes(paid ? 1 : 0);
  if (paid) expect(Order.updatePaymentStatus).toHaveBeenCalledWith('ORD-1', 'paid');
});
