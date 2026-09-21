const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requirePostgres } = require('./helpers');
const { getPool, closePool, isPoolOpen, initPool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');

describe('PostgreSQL pool', () => {
  before(async () => {
    await requirePostgres();
  });

  after(async () => {
    await closePool();
  });

  it('creates a shared pool and executes SELECT 1', async () => {
    assert.equal(isPoolOpen(), true);
    const result = await query('SELECT 1 AS ok');
    assert.equal(Number(result.rows[0].ok), 1);
    assert.equal(getPool(), getPool());
  });

  it('runs parameterized queries', async () => {
    const result = await query('SELECT $1::text AS value', ['codearena']);
    assert.equal(result.rows[0].value, 'codearena');
  });

  it('closes and can be reopened', async () => {
    await closePool();
    assert.equal(isPoolOpen(), false);
    initPool();
    const result = await query('SELECT 1 AS ok');
    assert.equal(Number(result.rows[0].ok), 1);
  });
});
