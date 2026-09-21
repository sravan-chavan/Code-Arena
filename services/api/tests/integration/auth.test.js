const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');
const { requirePostgres, uniqueEmail } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const userRepository = require('../../src/repositories/user.repository');
const { hashPassword } = require('../../src/auth/password');
const { ROLES } = require('../../src/auth/roles');
const authenticate = require('../../src/middleware/authentication.middleware');
const requireRole = require('../../src/middleware/authorization.middleware');
const errorMiddleware = require('../../src/middleware/error.middleware');
const { sendSuccess } = require('../../src/utils/api-response');

const PASSWORD = 'valid-pass';

function assertSafeUser(user) {
  assert.ok(user);
  assert.ok(user.id);
  assert.equal(typeof user.email, 'string');
  assert.ok(user.role);
  assert.equal(user.password, undefined);
  assert.equal(user.password_hash, undefined);
  assert.equal(user.passwordHash, undefined);
}

function assertNoSecrets(body, jwtSecret) {
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /password_hash/i);
  assert.doesNotMatch(text, /"passwordHash"/);
  if (jwtSecret) {
    assert.doesNotMatch(text, new RegExp(jwtSecret));
  }
}

function createRbacApp() {
  const app = express();
  app.use(express.json());
  app.get('/admin-only', authenticate, requireRole(ROLES.ADMIN), (req, res) =>
    sendSuccess(res, { ok: true, role: req.user.role }),
  );
  app.get(
    '/student-allowed',
    authenticate,
    requireRole(ROLES.STUDENT, ROLES.ADMIN),
    (req, res) => sendSuccess(res, { ok: true, role: req.user.role }),
  );
  app.use(errorMiddleware);
  return app;
}

describe('Authentication API (PostgreSQL)', () => {
  /** @type {import('express').Express} */
  let app;
  /** @type {import('express').Express} */
  let rbacApp;
  const emails = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
    app = createApp();
    rbacApp = createRbacApp();
  });

  after(async () => {
    for (const email of emails) {
      await query('DELETE FROM users WHERE email = $1', [email]).catch(() => {});
    }
    await closePool();
  });

  it('registers a student and never returns password_hash', async () => {
    const email = uniqueEmail('register');
    emails.push(email);

    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);

    assert.equal(res.body.success, true);
    assertSafeUser(res.body.data.user);
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.role, ROLES.STUDENT);
    assert.equal(res.body.data.token, undefined);
    assertNoSecrets(res.body);

    const stored = await query('SELECT email, password_hash, role FROM users WHERE email = $1', [
      email,
    ]);
    assert.equal(stored.rows[0].role, ROLES.STUDENT);
    assert.notEqual(stored.rows[0].password_hash, PASSWORD);
    assert.match(stored.rows[0].password_hash, /^\$2[aby]\$/);
  });

  it('normalizes email casing and whitespace on register and login', async () => {
    const local = uniqueEmail('case').split('@')[0];
    const storedEmail = `${local}@example.com`;
    emails.push(storedEmail);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: `  ${local.toUpperCase()}@Example.COM  `, password: PASSWORD })
      .expect(201);

    assert.equal(res.body.data.user.email, storedEmail);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: ` ${local.toUpperCase()}@EXAMPLE.com `, password: PASSWORD })
      .expect(200);

    assert.equal(login.body.data.user.email, storedEmail);
  });

  it('rejects duplicate emails including different casing', async () => {
    const email = uniqueEmail('dup');
    emails.push(email);
    await request(app)
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: email.toUpperCase(), password: PASSWORD })
      .expect(409);

    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Email already registered');
    assertNoSecrets(res.body);
  });

  it('ignores a client-supplied ADMIN role on public registration', async () => {
    const email = uniqueEmail('escalate');
    emails.push(email);

    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: PASSWORD, role: ROLES.ADMIN })
      .expect(201);

    assert.equal(res.body.data.user.role, ROLES.STUDENT);
    const stored = await query('SELECT role FROM users WHERE email = $1', [email]);
    assert.equal(stored.rows[0].role, ROLES.STUDENT);
  });

  it('logs in with valid credentials and returns a JWT with identity claims', async () => {
    const email = uniqueEmail('login');
    emails.push(email);
    await request(app)
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);

    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    assert.equal(res.body.success, true);
    assertSafeUser(res.body.data.user);
    assert.equal(typeof res.body.data.token, 'string');
    assertNoSecrets(res.body, process.env.JWT_SECRET);

    const payload = jwt.decode(res.body.data.token);
    assert.equal(payload.sub, res.body.data.user.id);
    assert.equal(payload.role, ROLES.STUDENT);
    assert.equal(payload.password, undefined);
    assert.equal(payload.password_hash, undefined);
    assert.equal(payload.email, undefined);
    assert.equal(typeof payload.exp, 'number');
  });

  it('uses the same generic error for a wrong password and a missing account', async () => {
    const email = uniqueEmail('generic');
    emails.push(email);
    await request(app)
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);

    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email, password: 'wrong-pass' })
      .expect(401);

    const missing = await request(app)
      .post('/auth/login')
      .send({ email: uniqueEmail('missing'), password: PASSWORD })
      .expect(401);

    assert.equal(wrongPassword.body.message, 'Invalid email or password');
    assert.equal(missing.body.message, wrongPassword.body.message);
    assert.doesNotMatch(wrongPassword.body.message, /does not exist|incorrect/i);
    assert.doesNotMatch(missing.body.message, /does not exist|incorrect/i);
    assertNoSecrets(wrongPassword.body);
    assertNoSecrets(missing.body);
  });

  it('returns the current user for GET /auth/me with a valid token', async () => {
    const email = uniqueEmail('me');
    emails.push(email);
    await request(app)
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assertSafeUser(res.body.data.user);
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.role, ROLES.STUDENT);
    assertNoSecrets(res.body);
  });

  it('also exposes versioned auth routes under /v1/auth', async () => {
    const email = uniqueEmail('v1');
    emails.push(email);
    const res = await request(app)
      .post('/v1/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    assert.equal(res.body.data.user.email, email);
  });

  it('allows ADMIN and rejects STUDENT on an ADMIN-protected test route', async () => {
    const studentEmail = uniqueEmail('rbac-student');
    const adminEmail = uniqueEmail('rbac-admin');
    emails.push(studentEmail, adminEmail);

    await request(app)
      .post('/auth/register')
      .send({ email: studentEmail, password: PASSWORD })
      .expect(201);
    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ email: studentEmail, password: PASSWORD })
      .expect(200);

    await userRepository.create({
      email: adminEmail,
      passwordHash: await hashPassword(PASSWORD),
      role: ROLES.ADMIN,
    });
    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);

    const denied = await request(rbacApp)
      .get('/admin-only')
      .set('Authorization', `Bearer ${studentLogin.body.data.token}`)
      .expect(403);
    assert.equal(denied.body.message, 'Forbidden');

    const allowed = await request(rbacApp)
      .get('/admin-only')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .expect(200);
    assert.equal(allowed.body.data.role, ROLES.ADMIN);

    const studentAllowed = await request(rbacApp)
      .get('/student-allowed')
      .set('Authorization', `Bearer ${studentLogin.body.data.token}`)
      .expect(200);
    assert.equal(studentAllowed.body.success, true);
  });

  it('rejects a structurally valid JWT when the user no longer exists', async () => {
    const token = jwt.sign(
      { sub: '00000000-0000-4000-8000-000000000099', role: ROLES.STUDENT },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    assert.equal(res.body.message, 'Authentication required');
  });

  it('does not leave production RBAC probe routes on the API', async () => {
    await request(app).get('/admin-only').expect(404);
    await request(app).get('/__rbac/admin').expect(404);
  });
});
