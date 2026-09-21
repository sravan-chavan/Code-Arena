const { createApp } = require('./app');
const config = require('./config/environment');
const { initPool, waitForDatabase, warmPool, closePool } = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const { logDatabaseError } = require('./db/errors');

let shuttingDown = false;

function setupShutdown(server) {
  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[API] ${signal} received — shutting down gracefully`);

    const forceTimer = setTimeout(() => {
      console.error('[API] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    server.close((closeError) => {
      if (closeError) {
        console.error('[API] Error during HTTP server close:', closeError.message);
        void closePool()
          .catch((poolError) => {
            logDatabaseError('Error closing PostgreSQL pool during failed HTTP close', poolError);
          })
          .finally(() => process.exit(1));
        return;
      }

      console.log('[API] HTTP server closed');
      void closePool()
        .then(() => {
          console.log('[API] PostgreSQL pool closed');
          process.exit(0);
        })
        .catch((poolError) => {
          logDatabaseError('Error closing PostgreSQL pool', poolError);
          process.exit(1);
        });
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function start() {
  initPool();
  await waitForDatabase();
  await warmPool();
  const migrationResult = await runMigrations();
  console.log(
    `[API] Migrations: applied=${migrationResult.applied.length} skipped=${migrationResult.skipped.length}`,
  );

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(
      `[API] Server started on ${config.host}:${config.port} (env=${config.env}, milestone=${config.milestone})`,
    );
  });

  setupShutdown(server);
  return { app, server };
}

start().catch(async (err) => {
  logDatabaseError('API failed to start', err);
  console.error('[API] Failed to start:', err.message);
  await closePool().catch(() => {});
  process.exit(1);
});
