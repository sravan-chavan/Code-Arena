const { createApp } = require('./app');
const config = require('./config/environment');
const { validateJwtConfig } = require('./config/jwt');
const {
  initMessaging,
  closeMessaging,
  logMessagingError,
} = require('./messaging');
const { startExecutionResultsConsumer } = require('./messaging/results-consumer');
const { attachRealtime, closeRealtime } = require('./realtime');

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

    closeRealtime();
    server.close((closeError) => {
      if (closeError) {
        console.error('[API] Error during HTTP server close:', closeError.message);
      } else {
        console.log('[API] HTTP server closed');
      }

      void closeMessaging()
        .then(() => {
          console.log('[API] RabbitMQ connection closed');
        })
        .catch((messagingError) => {
          logMessagingError('Error closing RabbitMQ connection', messagingError);
        })
        .then(() => closePool())
        .then(() => {
          console.log('[API] PostgreSQL pool closed');
          process.exit(closeError ? 1 : 0);
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

function isJwtConfigError(err) {
  return Boolean(err && (err.code === 'JWT_CONFIG_MISSING' || err.code === 'JWT_CONFIG_INVALID'));
}

function isMessagingStartupError(err) {
  return Boolean(
    err
    && (err.code === 'RABBITMQ_CONFIG_MISSING'
      || err.code === 'RABBITMQ_CONFIG_INVALID'
      || err.code === 'RABBITMQ_UNAVAILABLE'),
  );
}

async function start() {
  validateJwtConfig();
  initPool();
  await waitForDatabase();
  await warmPool();
  const migrationResult = await runMigrations();
  console.log(
    `[API] Migrations: applied=${migrationResult.applied.length} skipped=${migrationResult.skipped.length}`,
  );

  // Topology is asserted so publishers can route to the execution queue.
  // The Worker consumes execution requests. The API consumes execution
  // started/completed results and publishes WebSocket notifications.
  await initMessaging({ serviceName: config.serviceName });
  await startExecutionResultsConsumer();
  console.log('[API] RabbitMQ producer ready; execution consumption belongs to Worker');

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(
      `[API] Server started on ${config.host}:${config.port} (env=${config.env}, milestone=${config.milestone})`,
    );
  });
  attachRealtime(server);

  setupShutdown(server);
  return { app, server };
}

start().catch(async (err) => {
  if (isMessagingStartupError(err)) {
    logMessagingError('API failed to start', err);
  } else if (!isJwtConfigError(err)) {
    logDatabaseError('API failed to start', err);
  }
  console.error('[API] Failed to start:', err.message);
  await closeMessaging().catch(() => {});
  await closePool().catch(() => {});
  process.exit(1);
});
