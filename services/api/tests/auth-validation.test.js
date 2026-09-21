const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

describe('Auth HTTP validation', () => {
  /** @type {import('express').Express} */
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'test-only-jwt-secret-not-for-production-use';
    const { createApp } = require('../src/app');
    app = createApp();
  });

  it('rejects registration with an invalid email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'valid-pass' })
      .expect(400);

    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Validation failed');
    assert.ok(res.body.errors.some((error) => error.field === 'email'));
  });

  it('rejects a weak password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'student@example.com', password: 'short' })
      .expect(400);

    assert.equal(res.body.success, false);
    assert.ok(res.body.errors.some((error) => error.field === 'password'));
  });

  it('rejects missing credentials', async () => {
    const res = await request(app).post('/auth/register').send({}).expect(400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.errors.some((error) => error.field === 'email'));
    assert.ok(res.body.errors.some((error) => error.field === 'password'));
  });

  it('rejects login with missing password using the validation contract', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'student@example.com' })
      .expect(400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Validation failed');
  });
});
