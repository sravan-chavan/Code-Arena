const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadDatabaseConfig,
  missingDatabaseConfig,
  validateDatabaseConfig,
} = require('../src/config/database');

describe('Database configuration', () => {
  it('applies safe defaults when optional pool settings are absent', () => {
    const db = loadDatabaseConfig({
      DB_USER: 'codearena',
      DB_PASSWORD: 'secret',
    });

    assert.equal(db.host, 'localhost');
    assert.equal(db.port, 5432);
    assert.equal(db.name, 'codearena');
    assert.equal(db.user, 'codearena');
    assert.equal(db.password, 'secret');
    assert.equal(db.poolMin, 0);
    assert.equal(db.poolMax, 10);
    assert.equal(db.idleTimeoutMs, 10_000);
    assert.equal(db.connectionTimeoutMs, 2_000);
  });

  it('prefers DB_* variables over POSTGRES_* fallbacks', () => {
    const db = loadDatabaseConfig({
      DB_HOST: 'db.internal',
      DB_PORT: '6543',
      DB_NAME: 'arena',
      DB_USER: 'api',
      DB_PASSWORD: 'from-db',
      POSTGRES_HOST: 'postgres',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'codearena',
      POSTGRES_USER: 'codearena',
      POSTGRES_PASSWORD: 'from-postgres',
      DB_POOL_MIN: '2',
      DB_POOL_MAX: '8',
      DB_IDLE_TIMEOUT_MS: '15000',
      DB_CONNECTION_TIMEOUT_MS: '1500',
    });

    assert.equal(db.host, 'db.internal');
    assert.equal(db.port, 6543);
    assert.equal(db.name, 'arena');
    assert.equal(db.user, 'api');
    assert.equal(db.password, 'from-db');
    assert.equal(db.poolMin, 2);
    assert.equal(db.poolMax, 8);
    assert.equal(db.idleTimeoutMs, 15_000);
    assert.equal(db.connectionTimeoutMs, 1_500);
  });

  it('accepts POSTGRES_* fallbacks used by Docker Compose', () => {
    const db = loadDatabaseConfig({
      POSTGRES_HOST: 'postgres',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'codearena',
      POSTGRES_USER: 'codearena',
      POSTGRES_PASSWORD: 'compose-secret',
    });

    assert.equal(db.host, 'postgres');
    assert.equal(db.name, 'codearena');
    assert.equal(db.user, 'codearena');
    assert.equal(db.password, 'compose-secret');
  });

  it('falls back to defaults for invalid numeric values', () => {
    const db = loadDatabaseConfig({
      DB_USER: 'codearena',
      DB_PASSWORD: 'secret',
      DB_PORT: 'not-a-port',
      DB_POOL_MAX: '-4',
      DB_POOL_MIN: 'nope',
    });

    assert.equal(db.port, 5432);
    assert.equal(db.poolMax, 10);
    assert.equal(db.poolMin, 0);
  });

  it('reports missing required credentials without using hard-coded secrets', () => {
    const db = loadDatabaseConfig({});
    const missing = missingDatabaseConfig(db);
    assert.ok(missing.includes('DB_USER'));
    assert.ok(missing.includes('DB_PASSWORD'));
    assert.equal(db.password, '');
  });

  it('fails clearly when required database configuration is missing', () => {
    const db = loadDatabaseConfig({});
    assert.throws(() => validateDatabaseConfig(db), /Missing required database configuration/);
  });

  it('treats an explicitly empty password as specified', () => {
    const db = loadDatabaseConfig({
      DB_USER: 'codearena',
      DB_PASSWORD: '',
    });
    assert.equal(db.passwordSpecified, true);
    assert.doesNotThrow(() => validateDatabaseConfig(db));
  });
});
