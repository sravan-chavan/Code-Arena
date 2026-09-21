const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

describe('Unknown routes', () => {
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    const { createApp } = require('../src/app');
    app = createApp();
  });

  it('returns standardized 404 for unknown paths', async () => {
    const res = await request(app).get('/does-not-exist').expect(404);

    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Route not found/i);
  });

  it('returns 404 for unknown methods on known prefixes', async () => {
    const res = await request(app).post('/health').expect(404);

    assert.equal(res.body.success, false);
  });
});
