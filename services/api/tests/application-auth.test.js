const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const TEST_SECRET = 'test-only-jwt-secret-not-for-production-use';
const PROTECTED = [
  '/admin/me',
  '/admin/dashboard',
  '/student/me',
  '/student/dashboard',
  '/v1/admin/me',
  '/v1/student/dashboard',
];

describe('Application route authentication (no PostgreSQL)', () => {
  /** @type {import('express').Express} */
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.JWT_EXPIRES_IN = '1h';
    const { createApp } = require('../src/app');
    app = createApp();
  });

  for (const path of PROTECTED) {
    it(`returns 401 for unauthenticated GET ${path}`, async () => {
      const res = await request(app).get(path).expect(401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, 'Authentication required');
      assert.equal(res.body.stack, undefined);
    });
  }

  it('returns 401 for an invalid JWT on admin and student routes', async () => {
    const admin = await request(app)
      .get('/admin/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    const student = await request(app)
      .get('/student/dashboard')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);

    assert.equal(admin.body.message, 'Invalid or expired token');
    assert.equal(student.body.message, 'Invalid or expired token');
  });

  it('does not expose separate admin or student login endpoints', async () => {
    await request(app)
      .post('/admin/login')
      .send({ email: 'admin@example.com', password: 'valid-pass' })
      .expect(404);
    await request(app)
      .post('/student/login')
      .send({ email: 'student@example.com', password: 'valid-pass' })
      .expect(404);
  });

  it('does not add a duplicate application-context alias for /auth/me', async () => {
    const res = await request(app).get('/app/me').expect(404);
    assert.equal(res.body.success, false);
  });
});
