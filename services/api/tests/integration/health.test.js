const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requirePostgres } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');

describe('Database health API', () => {
  /** @type {import('express').Express} */
  let app;

  before(async () => {
    await requirePostgres();
    await runMigrations();
    app = createApp();
  });

  after(async () => {
    await closePool();
  });

  it('GET /health stays independent of PostgreSQL', async () => {
    const res = await request(app).get('/health').expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
    assert.equal(res.body.data.milestone, 4);
  });

  it('GET /v1/health/db succeeds when PostgreSQL is available', async () => {
    const res = await request(app).get('/v1/health/db').expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.database, 'up');
    assert.equal(typeof res.body.data.latencyMs, 'number');
    assert.ok(res.headers['x-request-id']);
  });

  it('GET /health/db is available on the compatibility health prefix', async () => {
    const res = await request(app).get('/health/db').expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.database, 'up');
  });
});
