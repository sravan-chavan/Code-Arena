const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const requireRole = require('../src/middleware/authorization.middleware');
const errorMiddleware = require('../src/middleware/error.middleware');
const { sendSuccess } = require('../src/utils/api-response');
const { ROLES } = require('../src/auth/roles');

describe('Authorization middleware', () => {
  let app;

  before(() => {
    process.env.NODE_ENV = 'test';
    app = express();
    app.use((req, _res, next) => {
      const role = req.headers['x-test-role'];
      if (role) {
        req.user = {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'rbac@example.com',
          role,
        };
      }
      next();
    });
    app.get('/admin-only', requireRole(ROLES.ADMIN), (req, res) =>
      sendSuccess(res, { ok: true, role: req.user.role }),
    );
    app.get(
      '/student-allowed',
      requireRole(ROLES.STUDENT, ROLES.ADMIN),
      (req, res) => sendSuccess(res, { ok: true, role: req.user.role }),
    );
    app.use(errorMiddleware);
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const res = await request(app).get('/admin-only').expect(401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Authentication required');
  });

  it('returns 403 when a STUDENT accesses an ADMIN route', async () => {
    const res = await request(app)
      .get('/admin-only')
      .set('X-Test-Role', ROLES.STUDENT)
      .expect(403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Forbidden');
  });

  it('allows ADMIN to access an ADMIN route', async () => {
    const res = await request(app)
      .get('/admin-only')
      .set('X-Test-Role', ROLES.ADMIN)
      .expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.role, ROLES.ADMIN);
  });

  it('allows STUDENT to access a STUDENT-allowed route', async () => {
    const res = await request(app)
      .get('/student-allowed')
      .set('X-Test-Role', ROLES.STUDENT)
      .expect(200);
    assert.equal(res.body.success, true);
  });
});
