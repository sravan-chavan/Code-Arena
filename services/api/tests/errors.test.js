const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const AppError = require('../src/errors/AppError');
const errorMiddleware = require('../src/middleware/error.middleware');
const notFoundMiddleware = require('../src/middleware/not-found.middleware');
const asyncHandler = require('../src/utils/async-handler');

describe('Error handling', () => {
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    app = express();
    app.use(express.json());

    app.get(
      '/boom-operational',
      asyncHandler((_req, _res, next) => {
        next(new AppError('Bad request example', 400));
      }),
    );

    app.get(
      '/boom-unexpected',
      asyncHandler(async () => {
        throw new Error('secret stack details');
      }),
    );

    app.use(notFoundMiddleware);
    app.use(errorMiddleware);
  });

  it('maps AppError to status and message', async () => {
    const res = await request(app).get('/boom-operational').expect(400);

    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Bad request example');
    assert.equal(res.body.stack, undefined);
  });

  it('hides unexpected error details from clients', async () => {
    const res = await request(app).get('/boom-unexpected').expect(500);

    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Internal server error');
    assert.doesNotMatch(JSON.stringify(res.body), /secret stack details/);
  });

  it('rejects invalid JSON payloads', async () => {
    const res = await request(app)
      .post('/boom-operational')
      .set('Content-Type', 'application/json')
      .send('{not-json')
      .expect(400);

    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Invalid JSON/i);
  });
});
