const request = require('supertest');
const app = require('../server');

describe('Health Check', () => {
  test('GET /health should return 200', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });
});

describe('Products API', () => {
  test('GET /api/v1/products should return products list', async () => {
    const response = await request(app)
      .get('/api/v1/products')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('GET /api/v1/products/:id should return 404 for non-existent product', async () => {
    const response = await request(app)
      .get('/api/v1/products/non-existent-id')
      .expect(404);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('error', 'Product not found');
  });
});

describe('Categories API', () => {
  test('GET /api/v1/categories should return categories list', async () => {
    const response = await request(app)
      .get('/api/v1/categories')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});

describe('Error Handling', () => {
  test('GET /non-existent-route should return 404', async () => {
    const response = await request(app)
      .get('/non-existent-route')
      .expect(404);

    expect(response.body).toHaveProperty('success', false);
  });
});