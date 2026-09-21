const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { initPool, closePool } = require('../src/db/pool');

describe('Database unavailability', () => {
  /** @type {import('express').Express} */
  let app;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '1';
    process.env.DB_NAME = 'codearena';
    process.env.DB_USER = 'codearena';
    process.env.DB_PASSWORD = 'invalid-for-unavailable-test';
    process.env.DB_CONNECTION_TIMEOUT_MS = '400';
    process.env.DB_POOL_MAX = '1';

    await closePool();
    initPool();
    app = createApp();
  });

  after(async () => {
    await closePool();
  });

  it('GET /health remains a liveness probe when PostgreSQL is down', async () => {
    const res = await request(app).get('/health').expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
  });

  it('GET /v1/health/db fails cleanly without leaking internals', async () => {
    const res = await request(app).get('/v1/health/db').expect(503);
    const bodyText = JSON.stringify(res.body);

    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Database is unavailable');
    assert.equal(res.body.stack, undefined);
    assert.doesNotMatch(bodyText, /invalid-for-unavailable-test/);
    assert.doesNotMatch(bodyText, /postgresql:\/\//i);
    assert.doesNotMatch(bodyText, /SELECT 1/);
    assert.doesNotMatch(bodyText, /at /);
  });

  it('pool query failure is a connection error, not a hang', async () => {
    const { query } = require('../src/db/query');
    await assert.rejects(() => query('SELECT 1'), (err) => {
      assert.ok(err);
      assert.doesNotMatch(String(err.message || ''), /invalid-for-unavailable-test/);
      return true;
    });
  });
});
