const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const TEST_SECRET = 'test-only-jwt-secret-not-for-production-use';

describe('Authentication middleware', () => {
  /** @type {import('express').Express} */
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.JWT_EXPIRES_IN = '1h';
    const { createApp } = require('../src/app');
    app = createApp();
  });

  it('rejects GET /auth/me without an Authorization header', async () => {
    const res = await request(app).get('/auth/me').expect(401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Authentication required');
    assert.equal(res.body.stack, undefined);
  });

  it('rejects a malformed Bearer header', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer')
      .expect(401);
    assert.equal(res.body.message, 'Authentication required');
  });

  it('rejects a non-Bearer scheme', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Basic abcdef')
      .expect(401);
    assert.equal(res.body.message, 'Authentication required');
  });

  it('rejects a malformed token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Invalid or expired token');
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      {
        sub: '00000000-0000-4000-8000-000000000001',
        role: 'STUDENT',
        iat: Math.floor(Date.now() / 1000) - 120,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      TEST_SECRET,
      { algorithm: 'HS256' },
    );
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    assert.equal(res.body.message, 'Invalid or expired token');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const other = jwt.sign(
      { sub: '00000000-0000-4000-8000-000000000001', role: 'STUDENT' },
      'different-secret-not-used-by-the-api-123',
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${other}`)
      .expect(401);
    assert.equal(res.body.message, 'Invalid or expired token');
  });
});
