const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

describe('Request logger auth hygiene', () => {
  /** @type {import('express').Express} */
  let app;
  /** @type {string[]} */
  let lines;

  before(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'test-only-jwt-secret-not-for-production-use';
    const { createApp } = require('../src/app');
    app = createApp();
  });

  it('does not log passwords, tokens, Authorization headers, or the JWT secret', async () => {
    lines = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => {
      lines.push(args.map(String).join(' '));
    };
    console.error = (...args) => {
      lines.push(args.map(String).join(' '));
    };

    try {
      await request(app)
        .post('/auth/register')
        .send({ email: 'logger@example.com', password: 'super-secret-password' });
      await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer pretend-jwt-token-value');
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    const combined = lines.join('\n');
    assert.match(combined, /POST \/auth\/register/);
    assert.match(combined, /GET \/auth\/me/);
    assert.doesNotMatch(combined, /super-secret-password/);
    assert.doesNotMatch(combined, /pretend-jwt-token-value/);
    assert.doesNotMatch(combined, /Authorization/i);
    assert.doesNotMatch(combined, /test-only-jwt-secret-not-for-production-use/);
    assert.doesNotMatch(combined, /Bearer /);
  });
});
