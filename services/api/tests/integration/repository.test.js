const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requirePostgres, uniqueKey } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { runMigrations } = require('../../src/db/migrate');
const appMeta = require('../../src/repositories/app-meta.repository');

describe('app_meta repository', () => {
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

  it('upserts and reads a row with parameterized SQL', async () => {
    const key = uniqueKey('repo');
    keys.push(key);

    const written = await appMeta.upsert(key, 'hello');
    assert.equal(written.key, key);
    assert.equal(written.value, 'hello');
    assert.ok(written.createdAt);
    assert.ok(written.updatedAt);

    const read = await appMeta.getByKey(key);
    assert.equal(read.value, 'hello');

    const updated = await appMeta.upsert(key, 'updated');
    assert.equal(updated.value, 'updated');
    assert.equal(await appMeta.deleteByKey(key), 1);
    assert.equal(await appMeta.getByKey(key), null);
  });
});
