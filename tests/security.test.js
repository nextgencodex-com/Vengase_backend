process.env.NODE_ENV = 'test';
process.env.WEBXPAY_SECRET_KEY = 'test-webxpay-secret';
process.env.FRONTEND_URL = 'https://vengase.com';

const crypto = require('crypto');
const request = require('supertest');

// Generate an ephemeral RSA keypair for WebXPay tests
const { publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
process.env.WEBXPAY_PUBLIC_KEY = publicKey;

// Mock Firebase config & firebase-admin before loading app
const mockVerifyIdToken = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../config/firebase', () => ({
  initializeFirebase: jest.fn(),
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
    getUser: mockGetUser,
    setCustomUserClaims: jest.fn(),
    createUser: jest.fn()
  }),
  getFirestore: () => ({
    collection: jest.fn(() => ({
      add: jest.fn().mockResolvedValue({ id: 'mock-doc' }),
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn().mockResolvedValue(true),
        update: jest.fn().mockResolvedValue(true)
      }))
    }))
  })
}));

jest.mock('firebase-admin', () => ({
  auth: () => ({
    verifyIdToken: mockVerifyIdToken,
    getUser: mockGetUser
  })
}));

const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const ImageService = require('../src/services/ImageService');
const app = require('../server');

describe('Vengase Security Regression & Verification Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // SEC-001: Unprotected Admin Creation
  describe('SEC-001: Admin Creation RBAC', () => {
    it('blocks unauthenticated POST /api/v1/admin/create-admin with 401', async () => {
      const res = await request(app)
        .post('/api/v1/admin/create-admin')
        .send({ email: 'attacker@evil.com', password: 'Password123!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('blocks non-admin authenticated user on POST /api/v1/admin/create-admin with 403', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'cust-1', email: 'customer@example.com' });
      mockGetUser.mockResolvedValue({ uid: 'cust-1', customClaims: {} });

      const res = await request(app)
        .post('/api/v1/admin/create-admin')
        .set('Authorization', 'Bearer valid-customer-token')
        .send({ email: 'attacker@evil.com', password: 'Password123!' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // SEC-002: WebXPay Callback Forgery Prevention
  describe('SEC-002: WebXPay Callback Fail-Closed Verification', () => {
    it('rejects unencrypted query callback without secret_key and does not mark order paid', async () => {
      const updatePaymentSpy = jest.spyOn(Order, 'updatePaymentStatus').mockResolvedValue({});

      const res = await request(app)
        .get('/api/v1/payment/callback?order_id=ORD-123&status_code=0');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('payment=failed');
      expect(updatePaymentSpy).not.toHaveBeenCalled();
      updatePaymentSpy.mockRestore();
    });

    it('rejects plain base64 payment payload even when secret_key matches', async () => {
      const updatePaymentSpy = jest.spyOn(Order, 'updatePaymentStatus').mockResolvedValue({});
      const forgedPlainB64 = Buffer.from('ORD-123|REF|2026-11-25|0|approved|gw').toString('base64');

      const res = await request(app)
        .post('/api/v1/payment/callback')
        .send({
          secret_key: 'test-webxpay-secret',
          payment: forgedPlainB64
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('payment=failed');
      expect(updatePaymentSpy).not.toHaveBeenCalled();
      updatePaymentSpy.mockRestore();
    });
  });

  // SEC-003: Server-Side Order Price Recalculation
  describe('SEC-003: Server-Side Price Integrity on Order Creation', () => {
    it('ignores tampered client item prices and computes authoritative total from catalog', async () => {
      const findProductSpy = jest.spyOn(Product, 'findById').mockResolvedValue({
        id: 1001,
        name: 'Signature Polo T-Shirt',
        price: 4300,
        discountedPrice: 3655,
        status: 'instock',
        img: '/uploads/polo.jpg'
      });

      const createOrderSpy = jest.spyOn(Order, 'create').mockImplementation(async (data) => ({
        id: 'ORD-TEST-1',
        orderId: 'ORD-TEST-1',
        ...data
      }));

      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          userEmail: 'buyer@example.com',
          userName: 'Test Buyer',
          phone: '+94771234567',
          items: [
            { productId: 1001, name: 'Signature Polo T-Shirt', price: 1, quantity: 2 }
          ],
          subtotalAmount: 2,
          shippingAmount: 0,
          totalAmount: 2,
          shippingAddress: {
            address: '123 Main Street',
            city: 'Colombo',
            postalCode: '00100',
            country: 'Sri Lanka'
          },
          paymentMethod: 'onepay'
        });

      expect(res.status).toBe(201);
      expect(createOrderSpy).toHaveBeenCalledTimes(1);
      const savedOrder = createOrderSpy.mock.calls[0][0];
      // 2 * 3655 = 7310 subtotal + 399 standard shipping = 7709
      expect(savedOrder.subtotalAmount).toBe(7310);
      expect(savedOrder.shippingAmount).toBe(399);
      expect(savedOrder.totalAmount).toBe(7709);
      expect(savedOrder.items[0].price).toBe(3655);

      findProductSpy.mockRestore();
      createOrderSpy.mockRestore();
    });
  });

  // SEC-004: WebXPay Payment Generation Amount Integrity
  describe('SEC-004: WebXPay Generate Uses Authoritative Order Total', () => {
    it('rejects non-existent orderId with 404', async () => {
      const findOrderSpy = jest.spyOn(Order, 'findById').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/payment/generate')
        .send({ orderId: 'ORD-FAKE', amount: 1 });

      expect(res.status).toBe(404);
      findOrderSpy.mockRestore();
    });
  });

  // SEC-005: Auth Signin / Register Require Verified Firebase Token
  describe('SEC-005: Authenticated /auth/signin and /auth/register', () => {
    it('rejects unauthenticated POST /api/v1/auth/signin with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signin')
        .send({ uid: 'victim-uid', email: 'victim@example.com' });

      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated POST /api/v1/auth/register with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ uid: 'victim-uid', email: 'victim@example.com' });

      expect(res.status).toBe(401);
    });
  });

  // SEC-006: Newsletter Admin RBAC
  describe('SEC-006: Newsletter Admin Routes Require Admin Claim', () => {
    it('blocks non-admin customer from GET /api/v1/newsletter/subscriptions and /export', async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'cust-2', email: 'regular@example.com' });
      mockGetUser.mockResolvedValue({ uid: 'cust-2', customClaims: {} });

      const listRes = await request(app)
        .get('/api/v1/newsletter/subscriptions')
        .set('Authorization', 'Bearer customer-token');
      expect(listRes.status).toBe(403);

      const exportRes = await request(app)
        .get('/api/v1/newsletter/export')
        .set('Authorization', 'Bearer customer-token');
      expect(exportRes.status).toBe(403);
    });
  });

  // SEC-007: Upload MIME Allowlist & Path Traversal Prevention
  describe('SEC-007: File Upload & Deletion Security', () => {
    it('rejects invalid traversal filenames in ImageService.deleteImage', async () => {
      await expect(ImageService.deleteImage('..')).rejects.toThrow('Invalid image filename');
      await expect(ImageService.deleteImage('bad;name.png')).rejects.toThrow('Invalid image filename');
    });

    it('rejects SVG upload MIME type in ImageService.saveUploadedFile', async () => {
      await expect(
        ImageService.saveUploadedFile({
          mimetype: 'image/svg+xml',
          originalname: 'xss.svg',
          buffer: Buffer.from('<svg onload=alert(1)></svg>')
        })
      ).rejects.toThrow('Failed to save uploaded image');
    });
  });

  // SEC-016: Security Headers
  describe('SEC-016: HTTP Security Headers', () => {
    it('sets Helmet security headers and Cache-Control no-store on /api/v1 responses', async () => {
      const res = await request(app).get('/api/v1/admin/verify');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['cache-control']).toContain('no-store');
    });
  });
});
