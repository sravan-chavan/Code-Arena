const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

describe('API contract (Milestone 1 regression)', () => {
  /** @type {import('express').Express} */
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    const { createApp } = require('../src/app');
    app = createApp();
  });

  it('GET / returns the success envelope', async () => {
    const res = await request(app).get('/').expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.service, 'api');
    assert.equal(res.body.data.milestone, 4);
    assert.equal(res.body.data.health, '/health');
    assert.equal(res.body.data.versionedHealth, '/v1/health');
    assert.ok(res.headers['x-request-id']);
  });

  it('GET /v1 returns the versioned success envelope', async () => {
    const res = await request(app).get('/v1').expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.version, 'v1');
    assert.equal(res.body.data.milestone, 4);
  });

  it('honors incoming request IDs', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', 'contract-request-id')
      .expect(200);
    assert.equal(res.headers['x-request-id'], 'contract-request-id');
  });

  it('sets basic security headers', async () => {
    const res = await request(app).get('/health').expect(200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  it('rejects malformed JSON with the standard 400 contract', async () => {
    const res = await request(app)
      .post('/v1')
      .set('Content-Type', 'application/json')
      .send('{not-json')
      .expect(400);

    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Invalid JSON/i);
    assert.equal(res.body.stack, undefined);
  });
});
