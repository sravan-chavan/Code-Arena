const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
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

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

function assertSafeUser(user) {
  assert.ok(user);
  assert.equal(typeof user.id, 'string');
  assert.equal(typeof user.email, 'string');
  assert.equal(user.password, undefined);
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.password_hash, undefined);
}

function assertNoSecrets(body) {
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /password_hash/i);
  assert.doesNotMatch(text, /"passwordHash"/);
  assert.doesNotMatch(text, /\$2[aby]\$/);
}

async function databaseCount() {
  const row = await query('SELECT COUNT(*)::int AS total FROM users');
  return row.rows[0].total;
}

describe('Admin user management (PostgreSQL)', () => {
  /** @type {import('express').Express} */
  let app;
  const emails = [];
  let adminToken;
  let studentToken;

  before(async () => {
    await requirePostgres();
    await runMigrations();
    app = createApp();

    const adminEmail = uniqueEmail('users-admin');
    emails.push(adminEmail);
    await userRepository.create({
      email: adminEmail,
      passwordHash: await hashPassword(PASSWORD),
      role: ROLES.ADMIN,
    });
    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    adminToken = adminLogin.body.data.token;

    const studentEmail = uniqueEmail('users-student');
    emails.push(studentEmail);
    await request(app)
      .post('/auth/register')
      .send({ email: studentEmail, password: PASSWORD })
      .expect(201);
    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ email: studentEmail, password: PASSWORD })
      .expect(200);
    studentToken = studentLogin.body.data.token;
  });

  after(async () => {
    for (const email of emails) {
      await query('DELETE FROM users WHERE email = $1', [email]).catch(() => {});
    }
    await closePool();
  });

  it('keeps public registration creating a student and ignoring a privileged role', async () => {
    const email = uniqueEmail('public-still');
    emails.push(email);
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: PASSWORD, role: ROLES.ADMIN })
      .expect(201);

    assert.equal(res.body.data.user.role, ROLES.STUDENT);
    assert.equal(res.body.data.user.password, undefined);
    assertNoSecrets(res.body);
    const stored = await query('SELECT role, password_hash FROM users WHERE email = $1', [email]);
    assert.equal(stored.rows[0].role, ROLES.STUDENT);
    assert.match(stored.rows[0].password_hash, /^\$2[aby]\$/);
    assert.notEqual(stored.rows[0].password_hash, PASSWORD);
  });

  it('lets an administrator list users and read the same total from the count endpoint', async () => {
    const listed = await request(app)
      .get('/admin/users')
      .set(authHeader(adminToken))
      .expect(200);
    const counted = await request(app)
      .get('/admin/users/count')
      .set(authHeader(adminToken))
      .expect(200);
    const total = await databaseCount();

    assert.equal(listed.body.success, true);
    assert.equal(listed.body.data.totalUsers, total);
    assert.equal(listed.body.data.total, total);
    assert.equal(counted.body.data.totalUsers, total);
    assert.ok(Array.isArray(listed.body.data.users));
    assert.ok(listed.body.data.users.length <= listed.body.data.pageSize);
    for (const user of listed.body.data.users) {
      assertSafeUser(user);
      assert.ok(user.role === ROLES.ADMIN || user.role === ROLES.STUDENT);
    }
    assertNoSecrets(listed.body);
    assertNoSecrets(counted.body);
    assert.equal(counted.body.data.users, undefined);
  });

  it('registers a student through the admin route, hashes the password, and allows login', async () => {
    const email = uniqueEmail('admin-reg');
    emails.push(email);
    const before = await databaseCount();

    const res = await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email: `  ${email.toUpperCase()}  `, password: PASSWORD })
      .expect(201);

    assert.equal(res.body.message, 'Registration successful');
    assertSafeUser(res.body.data.user);
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.role, ROLES.STUDENT);
    assert.equal(res.body.data.token, undefined);
    assertNoSecrets(res.body);

    const stored = await query(
      'SELECT role, password_hash FROM users WHERE email = $1',
      [email],
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].role, ROLES.STUDENT);
    assert.match(stored.rows[0].password_hash, /^\$2[aby]\$/);
    assert.notEqual(stored.rows[0].password_hash, PASSWORD);

    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    assert.equal(login.body.data.user.role, ROLES.STUDENT);

    const after = await request(app)
      .get('/admin/users/count')
      .set(authHeader(adminToken))
      .expect(200);
    assert.equal(after.body.data.totalUsers, before + 1);

    const found = await request(app)
      .get('/admin/users')
      .query({ search: email })
      .set(authHeader(adminToken))
      .expect(200);
    assert.equal(found.body.data.total, 1);
    assert.equal(found.body.data.users[0].email, email);
    assert.equal(found.body.data.totalUsers, before + 1);
  });

  it('rejects invalid registration data and does not insert a row', async () => {
    const before = await databaseCount();
    const missing = await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email: uniqueEmail('missing-pass') })
      .expect(400);
    const invalidEmail = await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email: 'not-an-email', password: PASSWORD })
      .expect(400);
    const shortPassword = await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email: uniqueEmail('short-pass'), password: 'short' })
      .expect(400);

    assert.equal(missing.body.success, false);
    assert.equal(missing.body.errors[0].field, 'password');
    assert.equal(invalidEmail.body.errors[0].field, 'email');
    assert.equal(shortPassword.body.errors[0].field, 'password');
    assert.equal(await databaseCount(), before);
    assertNoSecrets(missing.body);
  });

  it('rejects a privileged role on the admin route and does not create that account', async () => {
    const email = uniqueEmail('no-admin');
    emails.push(email);
    const before = await databaseCount();
    const res = await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email, password: PASSWORD, role: ROLES.ADMIN })
      .expect(400);

    assert.equal(res.body.errors[0].field, 'role');
    assert.equal(res.body.message, 'Only student accounts can be registered');
    const stored = await query('SELECT id FROM users WHERE email = $1', [email]);
    assert.equal(stored.rows.length, 0);
    assert.equal(await databaseCount(), before);
  });

  it('rejects duplicate emails once, including concurrent registrations', async () => {
    const email = uniqueEmail('dup-admin');
    emails.push(email);
    await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email, password: PASSWORD })
      .expect(201);

    const duplicate = await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email: email.toUpperCase(), password: PASSWORD })
      .expect(409);
    assert.equal(duplicate.body.message, 'Email already registered');
    assert.equal(duplicate.body.code, 'EMAIL_TAKEN');
    assertNoSecrets(duplicate.body);

    const raceEmail = uniqueEmail('race-admin');
    emails.push(raceEmail);
    const [first, second] = await Promise.all([
      request(app)
        .post('/admin/users')
        .set(authHeader(adminToken))
        .send({ email: raceEmail, password: PASSWORD }),
      request(app)
        .post('/admin/users')
        .set(authHeader(adminToken))
        .send({ email: raceEmail, password: PASSWORD }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const stored = await query('SELECT COUNT(*)::int AS total FROM users WHERE email = $1', [
      raceEmail,
    ]);
    assert.equal(stored.rows[0].total, 1);
  });

  it('searches by email, filters by role, and escapes LIKE wildcards', async () => {
    const stamp = `find-${process.pid}-${Date.now()}`;
    const studentEmail = uniqueEmail(stamp);
    const adminEmail = uniqueEmail(`${stamp}-adm`);
    emails.push(studentEmail, adminEmail);
    await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email: studentEmail, password: PASSWORD })
      .expect(201);
    await userRepository.create({
      email: adminEmail,
      passwordHash: await hashPassword(PASSWORD),
      role: ROLES.ADMIN,
    });

    const students = await request(app)
      .get('/admin/users')
      .query({ search: stamp, role: 'student', pageSize: '10' })
      .set(authHeader(adminToken))
      .expect(200);
    assert.equal(students.body.data.total, 1);
    assert.equal(students.body.data.users[0].email, studentEmail);
    assert.ok(students.body.data.totalUsers > students.body.data.total);

    const admins = await request(app)
      .get('/admin/users')
      .query({ search: stamp, role: 'ADMIN' })
      .set(authHeader(adminToken))
      .expect(200);
    assert.equal(admins.body.data.total, 1);
    assert.equal(admins.body.data.users[0].role, ROLES.ADMIN);

    const pageOne = await request(app)
      .get('/admin/users')
      .query({ search: stamp, page: '1', pageSize: '1' })
      .set(authHeader(adminToken))
      .expect(200);
    const pageTwo = await request(app)
      .get('/admin/users')
      .query({ search: stamp, page: '2', pageSize: '1' })
      .set(authHeader(adminToken))
      .expect(200);
    assert.equal(pageOne.body.data.total, 2);
    assert.equal(pageOne.body.data.pageCount, 2);
    assert.equal(pageOne.body.data.users.length, 1);
    assert.equal(pageTwo.body.data.users.length, 1);
    assert.notEqual(pageOne.body.data.users[0].id, pageTwo.body.data.users[0].id);

    const wildcard = await request(app)
      .get('/admin/users')
      .query({ search: '%' })
      .set(authHeader(adminToken))
      .expect(200);
    assert.ok(wildcard.body.data.users.every((user) => user.email.includes('%')));
    assert.equal(wildcard.body.data.totalUsers, await databaseCount());

    const injected = await request(app)
      .get('/admin/users')
      .query({ search: "' OR 1=1 --" })
      .set(authHeader(adminToken))
      .expect(200);
    assert.ok(injected.body.data.users.every((user) => user.email.includes("' OR 1=1 --")));

    const badRole = await request(app)
      .get('/admin/users')
      .query({ role: 'OWNER' })
      .set(authHeader(adminToken))
      .expect(400);
    assert.equal(badRole.body.code, 'VALIDATION_ERROR');
  });

  it('rejects students and anonymous callers without revealing the user list', async () => {
    const hidden = uniqueEmail('hidden-user');
    emails.push(hidden);
    await request(app)
      .post('/admin/users')
      .set(authHeader(adminToken))
      .send({ email: hidden, password: PASSWORD })
      .expect(201);
    const before = await databaseCount();

    const list = await request(app)
      .get('/admin/users')
      .set(authHeader(studentToken))
      .expect(403);
    const count = await request(app)
      .get('/admin/users/count')
      .set(authHeader(studentToken))
      .expect(403);
    const blockedEmail = uniqueEmail('student-create');
    emails.push(blockedEmail);
    const created = await request(app)
      .post('/admin/users')
      .set(authHeader(studentToken))
      .send({ email: blockedEmail, password: PASSWORD, role: ROLES.ADMIN })
      .expect(403);

    assert.equal(list.body.message, 'Forbidden');
    assert.equal(count.body.message, 'Forbidden');
    assert.equal(created.body.message, 'Forbidden');
    assert.equal(list.body.data, undefined);
    assert.doesNotMatch(JSON.stringify(list.body), new RegExp(hidden));
    assert.doesNotMatch(JSON.stringify(count.body), /totalUsers/);
    assert.equal(await databaseCount(), before);

    for (const path of ['/admin/users', '/admin/users/count', '/v1/admin/users/count']) {
      const res = await request(app).get(path).expect(401);
      assert.equal(res.body.message, 'Authentication required');
    }
    const anonEmail = uniqueEmail('anon-create');
    emails.push(anonEmail);
    const anonymousCreate = await request(app)
      .post('/admin/users')
      .send({ email: anonEmail, password: PASSWORD })
      .expect(401);
    assert.equal(anonymousCreate.body.message, 'Authentication required');
    assert.equal(await databaseCount(), before);

    const invalid = await request(app)
      .get('/admin/users')
      .set(authHeader('not-a-jwt'))
      .expect(401);
    assert.equal(invalid.body.message, 'Invalid or expired token');
  });
});
