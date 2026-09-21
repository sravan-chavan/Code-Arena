const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { validate } = require('../src/middleware/validation.middleware');
const errorMiddleware = require('../src/middleware/error.middleware');
const { sendSuccess } = require('../src/utils/api-response');

describe('Validation middleware', () => {
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    app = express();
    app.use(express.json());

    app.post(
      '/demo',
      validate({
        body: {
          name: { type: 'string', required: true, minLength: 2, maxLength: 32 },
          count: { type: 'number', required: false, min: 0, max: 10 },
        },
      }),
      (req, res) => sendSuccess(res, req.body, 200, 'ok'),
    );

    app.get(
      '/items/:id',
      validate({
        params: {
          id: { type: 'string', required: true, minLength: 1 },
        },
        query: {
          limit: { type: 'string', required: false },
        },
      }),
      (req, res) =>
        sendSuccess(res, { id: req.params.id, limit: req.query.limit }, 200),
    );

    app.use(errorMiddleware);
  });

  it('accepts valid body payloads', async () => {
    const res = await request(app)
      .post('/demo')
      .send({ name: 'alpha', count: 3 })
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.name, 'alpha');
  });

  it('rejects missing required fields with field errors', async () => {
    const res = await request(app).post('/demo').send({}).expect(400);

    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Validation failed');
    assert.ok(Array.isArray(res.body.errors));
    assert.ok(res.body.errors.some((e) => e.field === 'name'));
  });

  it('rejects wrong types', async () => {
    const res = await request(app)
      .post('/demo')
      .send({ name: 42 })
      .expect(400);

    assert.equal(res.body.success, false);
    assert.ok(res.body.errors.some((e) => /type string/i.test(e.message)));
  });

  it('validates params', async () => {
    const res = await request(app).get('/items/abc').expect(200);
    assert.equal(res.body.data.id, 'abc');
  });
});
