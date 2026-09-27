const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requirePostgres } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const {
  runMigrations,
  rollbackLast,
  getAppliedMigrations,
} = require('../../src/db/migrate');

function writeMigration(directory, fileName, source) {
  fs.writeFileSync(path.join(directory, fileName), source);
}

describe('Migrations', () => {
  before(async () => {
    await requirePostgres();
  });

  after(async () => {
    await closePool();
  });

  it('executes foundation migrations and records them once', async () => {
    const first = await runMigrations();
    const applied = await getAppliedMigrations();
    const versions = applied.map((row) => row.version);

    assert.ok(versions.includes('001'));
    assert.ok(versions.includes('002'));
    assert.ok(versions.includes('003'));
    const second = await runMigrations();
    assert.deepEqual(second.applied, []);
    assert.ok(second.skipped.includes('001'));
    assert.ok(second.skipped.includes('002'));
    assert.ok(second.skipped.includes('003'));

    const afterSecond = await getAppliedMigrations();
    assert.equal(
      afterSecond.filter((row) => row.version === '001').length,
      1,
    );
    assert.ok(first.applied.includes('001') || first.skipped.includes('001'));
  });

  it('creates the app_meta foundation table', async () => {
    await runMigrations();
    const result = await query(
      `SELECT value FROM app_meta WHERE key = $1`,
      ['foundation'],
    );
    assert.equal(result.rows[0].value, 'm2');
  });

  it('does not record a failed migration', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codearena-mig-fail-'));
    writeMigration(
      directory,
      '900_fail.js',
      `module.exports = {
        id: '900',
        name: 'intentional_failure',
        up: async () => { throw new Error('boom'); },
        down: 'SELECT 1',
      };`,
    );

    await assert.rejects(() => runMigrations({ directory }), /900|failed/i);

    const applied = await getAppliedMigrations();
    assert.equal(
      applied.some((row) => row.version === '900'),
      false,
    );
  });

  it('refuses to re-run a migration whose contents changed', async () => {
    await runMigrations();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codearena-mig-changed-'));
    writeMigration(
      directory,
      '001_create_app_meta.js',
      `module.exports = {
        id: '001',
        name: 'create_app_meta',
        up: 'SELECT 1',
      };`,
    );

    await assert.rejects(
      () => runMigrations({ directory }),
      /changed after being applied/i,
    );
  });

  it('rolls back the last applied migration when down is provided', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codearena-mig-rb-'));
    writeMigration(
      directory,
      '801_probe.js',
      `module.exports = {
        id: '801',
        name: 'rollback_probe',
        up: 'CREATE TABLE IF NOT EXISTS m2_rollback_probe (id INT PRIMARY KEY)',
        down: 'DROP TABLE IF EXISTS m2_rollback_probe',
      };`,
    );

    const applied = await runMigrations({ directory });
    assert.deepEqual(applied.applied, ['801']);

    const exists = await query(`SELECT to_regclass('public.m2_rollback_probe') AS rel`);
    assert.ok(exists.rows[0].rel);

    const rolled = await rollbackLast({ directory });
    assert.equal(rolled.rolledBack, '801');

    const gone = await query(`SELECT to_regclass('public.m2_rollback_probe') AS rel`);
    assert.equal(gone.rows[0].rel, null);

    const remaining = await getAppliedMigrations();
    assert.equal(
      remaining.some((row) => row.version === '801'),
      false,
    );
  });
});
