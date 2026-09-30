const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

describe('Health endpoints', () => {
  /** @type {import('express').Express} */
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    const { createApp } = require('../src/app');
    app = createApp();
  });

  it('GET /health returns success envelope and ok status', async () => {
    const res = await request(app).get('/health').expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
    assert.equal(res.body.data.service, 'api');
    assert.equal(res.body.data.milestone, 10);
    assert.ok(res.headers['x-request-id']);
  });

  it('GET /v1/health returns versioned health', async () => {
    const res = await request(app).get('/v1/health').expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
    assert.equal(res.body.data.service, 'api');
  });
});
