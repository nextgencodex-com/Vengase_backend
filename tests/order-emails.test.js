jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/models/Order', () => ({ findById: jest.fn() }));
jest.mock('../config/firebase', () => ({ getFirestore: jest.fn() }));
jest.mock('@emailjs/nodejs', () => ({ send: jest.fn() }));
jest.mock('resend', () => ({ Resend: jest.fn() }));
const Order = require('../src/models/Order');
const { getFirestore } = require('../config/firebase');
const emailjs = require('@emailjs/nodejs');
const { Resend } = require('resend');
const resendSend = jest.fn();
Resend.mockImplementation(() => ({ emails: { send: resendSend } }));
Object.assign(process.env, { RESEND_API_KEY: 'test', EMAILJS_SERVICE_ID: 'test', EMAILJS_TEMPLATE_ID: 'test', EMAILJS_PUBLIC_KEY: 'test', EMAILJS_PRIVATE_KEY: 'test', ADMIN_EMAIL: 'merchant@example.com' });
const { sendOrderConfirmationEmails } = require('../src/utils/emailService');
let order;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  order = { orderId: 'ORD-1', userEmail: 'buyer@example.com', paymentMethod: 'onepay', totalAmount: 1200, items: [] };
  Order.findById.mockImplementation(async () => order);
  getFirestore.mockReturnValue({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true }), update: async fields => Object.assign(order, fields) }) }) });
  emailjs.send.mockResolvedValue({ status: 200 });
  resendSend.mockResolvedValue({ data: { id: 'email-1' } });
});
afterEach(() => jest.restoreAllMocks());
test.each(['card', 'payzy', 'mintpay', 'onepay', 'cod'])('%s: customer and merchant both receive emails; repeated calls skip completed sends', async paymentMethod => {
  order.paymentMethod = paymentMethod;
  await Promise.all([sendOrderConfirmationEmails('ORD-1'), sendOrderConfirmationEmails('ORD-1')]);
  expect(emailjs.send.mock.calls[0][2].to_email).toBe('buyer@example.com');
  expect(resendSend.mock.calls[0][0].to).toBe('merchant@example.com');
  expect(order.confirmationEmailSent).toBe(true);
  await sendOrderConfirmationEmails('ORD-1');
  expect(emailjs.send).toHaveBeenCalledTimes(1);
  expect(resendSend).toHaveBeenCalledTimes(1);
});
test('merchant failure retries only merchant, preserving customer success', async () => {
  resendSend.mockRejectedValue(new Error('provider unavailable'));
  emailjs.send.mockImplementation(async (service, template, params) => {
    if (params.to_email === 'merchant@example.com') throw new Error('fallback unavailable');
    return { status: 200 };
  });
  expect(await sendOrderConfirmationEmails('ORD-1')).toEqual({ success: false });
  expect(order.customerConfirmationEmailSent).toBe(true);
  expect(order.confirmationEmailSent).toBe(false);
  resendSend.mockResolvedValue({ data: { id: 'retry-1' } });
  expect(await sendOrderConfirmationEmails('ORD-1')).toEqual({ success: true });
  expect(emailjs.send.mock.calls.filter(call => call[2].to_email === 'buyer@example.com')).toHaveLength(1);
  expect(order.confirmationEmailSent).toBe(true);
});
