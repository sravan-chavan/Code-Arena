const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requirePostgres, uniqueEmail } = require('./helpers');
const { closePool, getPool, initPool } = require('../../src/db/pool');
const { loadDatabaseConfig } = require('../../src/config/database');
const { query } = require('../../src/db/query');
const { runMigrations, getAppliedMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const { hashPassword, verifyPassword } = require('../../src/auth/password');
const { normalizeEmail } = require('../../src/auth/email');
const { ROLES } = require('../../src/auth/roles');
const seedDefaultAdmin = require('../../src/migrations/003_seed_default_admin');

const SEEDED_EMAIL = normalizeEmail('admin@codearena.com');
const SEEDED_PASSWORD = 'Admin@123';

describe('Default admin seed (migration 003)', () => {
  /** @type {import('express').Express} */
  let app;
  const studentEmails = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
    app = createApp();
  });

  after(async () => {
    for (const email of studentEmails) {
      await query('DELETE FROM users WHERE email = $1', [email]).catch(() => {});
    }
    await closePool();
  });

  it('records migration 003 and creates exactly one default ADMIN', async () => {
    const applied = await getAppliedMigrations();
    assert.ok(
      applied.some((row) => row.version === '003' && row.name === 'seed_default_admin'),
    );

    const rows = await query(
      `SELECT id, email, role, password_hash FROM users WHERE email = $1`,
      [SEEDED_EMAIL],
    );
    assert.equal(rows.rows.length, 1);
    const admin = rows.rows[0];
    assert.equal(admin.email, SEEDED_EMAIL);
    assert.equal(admin.role, ROLES.ADMIN);
  });

  it('stores a bcrypt hash and never stores the plaintext password', async () => {
    const row = await query(
      `SELECT password_hash FROM users WHERE email = $1`,
      [SEEDED_EMAIL],
    );
    const hash = row.rows[0].password_hash;
    assert.equal(typeof hash, 'string');
    assert.match(hash, /^\$2[aby]\$\d{2}\$/);
    assert.notEqual(hash, SEEDED_PASSWORD);
    assert.equal(await verifyPassword(SEEDED_PASSWORD, hash), true);
    assert.equal(await verifyPassword('wrong-password', hash), false);

    const leaking = await query(
      `SELECT id FROM users WHERE password_hash = $1 OR email = $2`,
      [SEEDED_PASSWORD, SEEDED_PASSWORD],
    );
    assert.equal(leaking.rows.length, 0);
  });

  it('does not create a second admin or overwrite the password on re-run', async () => {
    const before = await query(
      `SELECT id, password_hash FROM users WHERE email = $1`,
      [SEEDED_EMAIL],
    );
    const originalHash = before.rows[0].password_hash;

    const second = await runMigrations();
    assert.deepEqual(second.applied, []);
    assert.ok(second.skipped.includes('003'));

    const after = await query(
      `SELECT id, password_hash FROM users WHERE email = $1`,
      [SEEDED_EMAIL],
    );
    assert.equal(after.rows.length, 1);
    assert.equal(after.rows[0].id, before.rows[0].id);
    assert.equal(after.rows[0].password_hash, originalHash);
  });

  it('does not overwrite an existing default admin password_hash', async () => {
    const original = await query(
      `SELECT id, password_hash FROM users WHERE email = $1`,
      [SEEDED_EMAIL],
    );
    const marker = await hashPassword('DifferentSeed@123');
    await query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
      marker,
      SEEDED_EMAIL,
    ]);

    const client = await getPool().connect();
    try {
      await seedDefaultAdmin.up(client);
    } finally {
      client.release();
    }

    try {
      const row = await query(
        `SELECT id, password_hash, role FROM users WHERE email = $1`,
        [SEEDED_EMAIL],
      );
      assert.equal(row.rows.length, 1);
      assert.equal(row.rows[0].id, original.rows[0].id);
      assert.equal(row.rows[0].password_hash, marker);
      assert.equal(row.rows[0].role, ROLES.ADMIN);
    } finally {
      await query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
        original.rows[0].password_hash,
        SEEDED_EMAIL,
      ]);
    }
  });

  it('logs in the seeded admin and authorizes admin application APIs', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'Admin@CodeArena.com', password: SEEDED_PASSWORD })
      .expect(200);

    assert.equal(login.body.success, true);
    assert.equal(typeof login.body.data.token, 'string');
    assert.ok(login.body.data.token.length > 0);
    assert.equal(login.body.data.user.email, SEEDED_EMAIL);
    assert.equal(login.body.data.user.role, ROLES.ADMIN);
    assert.equal(login.body.data.user.password, undefined);
    assert.equal(login.body.data.user.password_hash, undefined);

    const token = login.body.data.token;
    const auth = { Authorization: `Bearer ${token}` };

    const me = await request(app).get('/auth/me').set(auth).expect(200);
    assert.equal(me.body.data.user.email, SEEDED_EMAIL);
    assert.equal(me.body.data.user.role, ROLES.ADMIN);

    const adminMe = await request(app).get('/admin/me').set(auth).expect(200);
    assert.equal(adminMe.body.data.user.role, ROLES.ADMIN);
    assert.equal(adminMe.body.data.application.role, ROLES.ADMIN);

    const dashboard = await request(app).get('/admin/dashboard').set(auth).expect(200);
    assert.equal(dashboard.body.data.application, 'admin');
    assert.equal(dashboard.body.data.role, ROLES.ADMIN);
    assert.equal(dashboard.body.data.status, 'ready');
  });

  it('does not change public student registration or student RBAC', async () => {
    const email = uniqueEmail('seed-student');
    studentEmails.push(email);

    const register = await request(app)
      .post('/auth/register')
      .send({ email, password: 'student-pass-1', role: ROLES.ADMIN })
      .expect(201);
    assert.equal(register.body.data.user.role, ROLES.STUDENT);

    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: 'student-pass-1' })
      .expect(200);
    const token = login.body.data.token;

    await request(app)
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    const studentDash = await request(app)
      .get('/student/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.equal(studentDash.body.data.role, ROLES.STUDENT);
  });

  it('seeds the default admin on a completely empty database', async () => {
    const original = loadDatabaseConfig();
    const freshName = `codearena_seed_${process.pid}`;
    assert.match(freshName, /^codearena_seed_\d+$/);

    await query(`CREATE DATABASE ${freshName}`);
    try {
      await closePool();
      initPool({ name: freshName });

      const first = await runMigrations();
      assert.ok(first.applied.includes('001'));
      assert.ok(first.applied.includes('002'));
      assert.ok(first.applied.includes('003'));

      const users = await query(
        `SELECT email, role, password_hash FROM users WHERE email = $1`,
        [SEEDED_EMAIL],
      );
      assert.equal(users.rows.length, 1);
      assert.equal(users.rows[0].email, SEEDED_EMAIL);
      assert.equal(users.rows[0].role, ROLES.ADMIN);
      assert.match(users.rows[0].password_hash, /^\$2[aby]\$\d{2}\$/);
      assert.notEqual(users.rows[0].password_hash, SEEDED_PASSWORD);
      assert.equal(await verifyPassword(SEEDED_PASSWORD, users.rows[0].password_hash), true);

      const second = await runMigrations();
      assert.deepEqual(second.applied, []);
      assert.ok(second.skipped.includes('003'));

      const again = await query(`SELECT id FROM users WHERE email = $1`, [SEEDED_EMAIL]);
      assert.equal(again.rows.length, 1);
    } finally {
      await closePool();
      initPool({ name: original.name });
      await query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [freshName],
      ).catch(() => {});
      await query(`DROP DATABASE IF EXISTS ${freshName}`);
    }
  });
});
