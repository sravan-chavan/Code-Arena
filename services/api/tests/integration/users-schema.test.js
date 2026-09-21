const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requirePostgres, uniqueEmail } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations, getAppliedMigrations } = require('../../src/db/migrate');

describe('users schema', () => {
  before(async () => {
    await requirePostgres();
    await runMigrations();
  });

  after(async () => {
    await closePool();
  });

  it('applies the users migration and skips it on the second run', async () => {
    const applied = await getAppliedMigrations();
    assert.ok(applied.some((row) => row.version === '002' && row.name === 'create_users'));

    const second = await runMigrations();
    assert.deepEqual(second.applied, []);
    assert.ok(second.skipped.includes('002'));
  });

  it('creates the users table with uuid primary keys and timestamps', async () => {
    const table = await query(`SELECT to_regclass('public.users') AS rel`);
    assert.ok(table.rows[0].rel);

    const email = uniqueEmail('schema');
    const inserted = await query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'STUDENT')
       RETURNING id, email, role, created_at, updated_at`,
      [email, '$2b$04$testhashnotarealbcrypthashvaluexxxx'],
    );
    const row = inserted.rows[0];
    assert.match(String(row.id), /^[0-9a-f-]{36}$/i);
    assert.equal(row.email, email);
    assert.equal(row.role, 'STUDENT');
    assert.ok(row.created_at instanceof Date);
    assert.ok(row.updated_at instanceof Date);

    await query('DELETE FROM users WHERE id = $1', [row.id]);
  });

  it('enforces unique email at the database', async () => {
    const email = uniqueEmail('unique');
    await query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)`,
      [email, 'hash-one'],
    );

    await assert.rejects(
      () =>
        query(`INSERT INTO users (email, password_hash) VALUES ($1, $2)`, [
          email,
          'hash-two',
        ]),
      (err) => err && err.code === '23505',
    );

    await query('DELETE FROM users WHERE email = $1', [email]);
  });

  it('rejects unknown roles', async () => {
    const email = uniqueEmail('role');
    await assert.rejects(
      () =>
        query(
          `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)`,
          [email, 'hash', 'SUPERUSER'],
        ),
      (err) => err && err.code === '23514',
    );
  });

  it('rejects mixed-case emails that bypass application normalization', async () => {
    await assert.rejects(
      () =>
        query(
          `INSERT INTO users (email, password_hash) VALUES ($1, $2)`,
          ['MixedCase@Example.com', 'hash'],
        ),
      (err) => err && err.code === '23514',
    );
  });
});
