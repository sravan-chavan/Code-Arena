const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { requirePostgres, uniqueEmail } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const userRepository = require('../../src/repositories/user.repository');
const { hashPassword } = require('../../src/auth/password');
const { ROLES } = require('../../src/auth/roles');

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

function assertNoSecrets(body) {
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /password_hash/i);
  assert.doesNotMatch(text, /"passwordHash"/);
  assert.doesNotMatch(text, /"password":/);
}

function assertNoBusinessMetrics(data) {
  assert.equal(data.users, undefined);
  assert.equal(data.contests, undefined);
  assert.equal(data.submissions, undefined);
  assert.equal(data.problems, undefined);
  assert.equal(data.students, undefined);
  assert.equal(data.leaderboard, undefined);
}

async function registerAndLogin(app, emails, prefix) {
  const email = uniqueEmail(prefix);
  emails.push(email);
  await request(app).post('/auth/register').send({ email, password: PASSWORD }).expect(201);
  const login = await request(app)
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    email,
    token: login.body.data.token,
    user: login.body.data.user,
  };
}

async function createAdminAndLogin(app, emails, prefix) {
  const email = uniqueEmail(prefix);
  emails.push(email);
  const user = await userRepository.create({
    email,
    passwordHash: await hashPassword(PASSWORD),
    role: ROLES.ADMIN,
  });
  const login = await request(app)
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    email,
    token: login.body.data.token,
    user: login.body.data.user,
    id: user.id,
  };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('Application APIs (Milestone 4, PostgreSQL)', () => {
  /** @type {import('express').Express} */
  let app;
  const emails = [];
  let student;
  let admin;

  before(async () => {
    await requirePostgres();
    await runMigrations();
    app = createApp();
    student = await registerAndLogin(app, emails, 'm4-student');
    admin = await createAdminAndLogin(app, emails, 'm4-admin');
  });

  after(async () => {
    for (const email of emails) {
      await query('DELETE FROM users WHERE email = $1', [email]).catch(() => {});
    }
    await closePool();
  });

  it('keeps existing registration, login, and /auth/me working for both roles', async () => {
    const studentMe = await request(app)
      .get('/auth/me')
      .set(authHeader(student.token))
      .expect(200);
    assert.equal(studentMe.body.success, true);
    assertSafeUser(studentMe.body.data.user);
    assert.equal(studentMe.body.data.user.role, ROLES.STUDENT);
    assert.equal(studentMe.body.data.application, undefined);

    const adminMe = await request(app)
      .get('/auth/me')
      .set(authHeader(admin.token))
      .expect(200);
    assert.equal(adminMe.body.data.user.role, ROLES.ADMIN);
    assertSafeUser(adminMe.body.data.user);
    assertNoSecrets(adminMe.body);
  });

  it('allows ADMIN to read admin application context', async () => {
    const res = await request(app)
      .get('/admin/me')
      .set(authHeader(admin.token))
      .expect(200);

    assert.equal(res.body.success, true);
    assertSafeUser(res.body.data.user);
    assert.equal(res.body.data.user.id, admin.user.id);
    assert.equal(res.body.data.user.email, admin.email);
    assert.equal(res.body.data.user.role, ROLES.ADMIN);
    assert.deepEqual(res.body.data.application, {
      name: 'CodeArena Admin',
      role: ROLES.ADMIN,
    });
    assertNoSecrets(res.body);
    assertNoBusinessMetrics(res.body.data);
  });

  it('allows ADMIN to read the admin dashboard foundation', async () => {
    const res = await request(app)
      .get('/admin/dashboard')
      .set(authHeader(admin.token))
      .expect(200);

    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, {
      application: 'admin',
      role: ROLES.ADMIN,
      status: 'ready',
    });
    assertNoBusinessMetrics(res.body.data);
    assertNoSecrets(res.body);
  });

  it('rejects STUDENT access to admin application APIs with 403', async () => {
    const me = await request(app)
      .get('/admin/me')
      .set(authHeader(student.token))
      .expect(403);
    const dashboard = await request(app)
      .get('/admin/dashboard')
      .set(authHeader(student.token))
      .expect(403);

    assert.equal(me.body.success, false);
    assert.equal(me.body.message, 'Forbidden');
    assert.equal(dashboard.body.message, 'Forbidden');
    assertNoSecrets(me.body);
  });

  it('allows STUDENT to read participant application context', async () => {
    const res = await request(app)
      .get('/student/me')
      .set(authHeader(student.token))
      .expect(200);

    assert.equal(res.body.success, true);
    assertSafeUser(res.body.data.user);
    assert.equal(res.body.data.user.id, student.user.id);
    assert.equal(res.body.data.user.email, student.email);
    assert.equal(res.body.data.user.role, ROLES.STUDENT);
    assert.deepEqual(res.body.data.application, {
      name: 'CodeArena Participant',
      role: ROLES.STUDENT,
    });
    assertNoSecrets(res.body);
  });

  it('allows STUDENT to read the participant dashboard foundation', async () => {
    const res = await request(app)
      .get('/student/dashboard')
      .set(authHeader(student.token))
      .expect(200);

    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, {
      application: 'participant',
      role: ROLES.STUDENT,
      status: 'ready',
    });
    assertNoBusinessMetrics(res.body.data);
    assertNoSecrets(res.body);
  });

  it('rejects ADMIN access to student application APIs with 403', async () => {
    const me = await request(app)
      .get('/student/me')
      .set(authHeader(admin.token))
      .expect(403);
    const dashboard = await request(app)
      .get('/student/dashboard')
      .set(authHeader(admin.token))
      .expect(403);

    assert.equal(me.body.message, 'Forbidden');
    assert.equal(dashboard.body.message, 'Forbidden');
  });

  it('returns 401 for unauthenticated application routes', async () => {
    const paths = ['/admin/me', '/admin/dashboard', '/student/me', '/student/dashboard'];
    for (const path of paths) {
      const res = await request(app).get(path).expect(401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.message, 'Authentication required');
    }
  });

  it('returns 401 for an invalid JWT on application routes', async () => {
    const res = await request(app)
      .get('/admin/me')
      .set(authHeader('not-a-jwt'))
      .expect(401);
    assert.equal(res.body.message, 'Invalid or expired token');
  });

  it('does not honor client-supplied role headers, query, or body', async () => {
    const viaHeader = await request(app)
      .get('/admin/me')
      .set(authHeader(student.token))
      .set('X-Role', ROLES.ADMIN)
      .set('X-User-Role', ROLES.ADMIN)
      .expect(403);
    const viaQuery = await request(app)
      .get('/admin/me')
      .query({ role: ROLES.ADMIN })
      .set(authHeader(student.token))
      .expect(403);
    const viaBody = await request(app)
      .get('/admin/me')
      .set(authHeader(student.token))
      .send({ role: ROLES.ADMIN })
      .expect(403);

    assert.equal(viaHeader.body.message, 'Forbidden');
    assert.equal(viaQuery.body.message, 'Forbidden');
    assert.equal(viaBody.body.message, 'Forbidden');
  });

  it('authorizes from the database identity, not a spoofed JWT role claim', async () => {
    const spoofed = jwt.sign(
      { sub: student.user.id, role: ROLES.ADMIN },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    );

    const denied = await request(app)
      .get('/admin/me')
      .set(authHeader(spoofed))
      .expect(403);
    assert.equal(denied.body.message, 'Forbidden');

    const allowed = await request(app)
      .get('/student/me')
      .set(authHeader(spoofed))
      .expect(200);
    assert.equal(allowed.body.data.user.role, ROLES.STUDENT);
    assert.equal(allowed.body.data.user.id, student.user.id);
  });

  it('exposes the same contracts on versioned /v1 application routes', async () => {
    const adminMe = await request(app)
      .get('/v1/admin/me')
      .set(authHeader(admin.token))
      .expect(200);
    assert.equal(adminMe.body.data.application.name, 'CodeArena Admin');

    const studentDashboard = await request(app)
      .get('/v1/student/dashboard')
      .set(authHeader(student.token))
      .expect(200);
    assert.equal(studentDashboard.body.data.application, 'participant');

    await request(app)
      .get('/v1/admin/dashboard')
      .set(authHeader(student.token))
      .expect(403);
    await request(app)
      .get('/v1/student/me')
      .set(authHeader(admin.token))
      .expect(403);
  });
});
