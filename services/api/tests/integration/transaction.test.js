const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requirePostgres, uniqueKey } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { runMigrations } = require('../../src/db/migrate');
const { withTransaction } = require('../../src/db/transaction');
const appMeta = require('../../src/repositories/app-meta.repository');

describe('Transactions', () => {
  const keys = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
  });

  after(async () => {
    for (const key of keys) {
      await appMeta.deleteByKey(key).catch(() => {});
    }
    await closePool();
  });

  it('commits a successful transaction', async () => {
    const key = uniqueKey('tx-commit');
    keys.push(key);

    await withTransaction(async (client) => {
      await appMeta.upsert(key, 'committed', client);
    });

    const row = await appMeta.getByKey(key);
    assert.equal(row.value, 'committed');
  });

  it('rolls back a failed transaction', async () => {
    const key = uniqueKey('tx-rollback');
    keys.push(key);

    await assert.rejects(
      () =>
        withTransaction(async (client) => {
          await appMeta.upsert(key, 'should-not-persist', client);
          throw new Error('force rollback');
        }),
      /force rollback/,
    );

    assert.equal(await appMeta.getByKey(key), null);
  });
});
