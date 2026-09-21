const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { getPool, initPool, waitForDatabase, closePool } = require('./pool');
const { logDatabaseError } = require('./errors');

const DEFAULT_DIRECTORY = path.join(__dirname, '..', 'migrations');
const ADVISORY_LOCK_KEY = 820221;

function checksumOf(migration) {
  const body =
    typeof migration.up === 'function' ? migration.up.toString() : String(migration.up);
  return createHash('sha256')
    .update(`${migration.id}\n${migration.name}\n${body}`)
    .digest('hex');
}

function loadMigrationFiles(directory = DEFAULT_DIRECTORY) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Migrations directory not found: ${directory}`);
  }

  const files = fs
    .readdirSync(directory)
    .filter((name) => /^\d+.*\.js$/.test(name))
    .sort();

  return files.map((file) => {
    const fullPath = path.join(directory, file);
    // Fresh load for test fixtures that rewrite the same path.
    delete require.cache[require.resolve(fullPath)];
    const migration = require(fullPath);
    if (!migration || !migration.id || !migration.name || !migration.up) {
      throw new Error(`Invalid migration file ${file}: id, name, and up are required`);
    }
    return {
      id: String(migration.id),
      name: String(migration.name),
      up: migration.up,
      down: migration.down,
      file,
      checksum: checksumOf(migration),
    };
  });
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS schema_migrations_applied_at_idx
      ON schema_migrations (applied_at)
  `);
}

async function applyUp(client, migration) {
  if (typeof migration.up === 'function') {
    await migration.up(client);
    return;
  }
  await client.query(migration.up);
}

async function applyDown(client, migration) {
  if (!migration.down) {
    throw new Error(`Migration ${migration.id} (${migration.name}) has no down() defined`);
  }
  if (typeof migration.down === 'function') {
    await migration.down(client);
    return;
  }
  await client.query(migration.down);
}

async function getAppliedMigrations(client) {
  const executor = client || getPool();
  await ensureMigrationsTable(executor);
  const result = await executor.query(
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC',
  );
  return result.rows;
}

/**
 * Apply pending migrations in version order. Safe to run repeatedly.
 *
 * @param {{ directory?: string }} [options]
 */
async function runMigrations(options = {}) {
  const directory = options.directory || DEFAULT_DIRECTORY;
  const migrations = loadMigrationFiles(directory);
  const pool = getPool();
  const client = await pool.connect();

  const applied = [];
  const skipped = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await ensureMigrationsTable(client);

    const existing = await client.query(
      'SELECT version, checksum, name FROM schema_migrations',
    );
    const byVersion = new Map(existing.rows.map((row) => [row.version, row]));

    for (const migration of migrations) {
      const previous = byVersion.get(migration.id);
      if (previous) {
        if (previous.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.id} (${migration.name}) has changed after being applied. Refusing to run.`,
          );
        }
        skipped.push(migration.id);
        continue;
      }

      try {
        await client.query('BEGIN');
        await applyUp(client, migration);
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum)
           VALUES ($1, $2, $3)`,
          [migration.id, migration.name, migration.checksum],
        );
        await client.query('COMMIT');
        applied.push(migration.id);
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          logDatabaseError('Migration rollback failed', rollbackErr);
        }
        const wrapped = new Error(
          `Migration ${migration.id} (${migration.name}) failed`,
        );
        wrapped.cause = err;
        throw wrapped;
      }
    }

    return { applied, skipped };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch (err) {
      logDatabaseError('Failed to release migration advisory lock', err);
    }
    client.release();
  }
}

/**
 * Roll back the most recently applied migration that has a down script.
 * Provided as a foundation for a future rollback strategy — not used at runtime.
 *
 * @param {{ directory?: string }} [options]
 */
async function rollbackLast(options = {}) {
  const directory = options.directory || DEFAULT_DIRECTORY;
  const migrations = loadMigrationFiles(directory);
  const byId = new Map(migrations.map((migration) => [migration.id, migration]));
  const client = await getPool().connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await ensureMigrationsTable(client);
    const { rows } = await client.query(
      'SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1',
    );
    if (rows.length === 0) {
      return { rolledBack: null };
    }

    const version = rows[0].version;
    const migration = byId.get(version);
    if (!migration) {
      throw new Error(
        `Cannot roll back ${version}: migration file not found in ${directory}`,
      );
    }

    await client.query('BEGIN');
    await applyDown(client, migration);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
    await client.query('COMMIT');
    return { rolledBack: version };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logDatabaseError('Rollback of last migration failed', rollbackErr);
    }
    throw err;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch (err) {
      logDatabaseError('Failed to release migration advisory lock', err);
    }
    client.release();
  }
}

async function runCli() {
  try {
    initPool();
    await waitForDatabase();
    const result = await runMigrations();
    console.log(
      `[API] Migrations complete: applied=${result.applied.length} skipped=${result.skipped.length}`,
    );
    if (result.applied.length > 0) {
      console.log(`[API] Applied: ${result.applied.join(', ')}`);
    }
    await closePool();
  } catch (err) {
    logDatabaseError('Migration CLI failed', err);
    console.error('[API] Migration failed:', err.message);
    await closePool().catch(() => {});
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void runCli();
}

module.exports = {
  runMigrations,
  rollbackLast,
  getAppliedMigrations,
  loadMigrationFiles,
  DEFAULT_DIRECTORY,
};
