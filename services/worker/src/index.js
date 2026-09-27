/**
 * CodeArena Worker service entrypoint (Milestone 6).
 *
 * Owns RabbitMQ execution consumption, job processing boundary, lifecycle,
 * and graceful shutdown. Does not call Judge0 or execute user code.
 */

const { createWorker } = require('./lifecycle');
const { loadRabbitmqConfig } = require('@codearena/messaging');

async function main() {
  // Worker enables reconnect by default unless explicitly disabled.
  if (process.env.RABBITMQ_RECONNECT_ENABLED === undefined) {
    process.env.RABBITMQ_RECONNECT_ENABLED = 'true';
  }
  if (process.env.CODEARENA_SERVICE_NAME === undefined) {
    process.env.CODEARENA_SERVICE_NAME = 'worker';
  }

  const worker = createWorker();
  worker.setupSignalHandlers();

  process.on('unhandledRejection', (reason) => {
    const message = reason && reason.message ? reason.message : String(reason);
    console.error(`[WORKER] Unhandled rejection: ${message}`);
  });

  await worker.start();
  const rabbit = loadRabbitmqConfig();
  console.log(
    `[WORKER] Ready queue=${rabbit.executionQueue} prefetch=${rabbit.prefetch} reconnect=${rabbit.reconnectEnabled}`,
  );
}

main().catch((err) => {
  console.error(`[WORKER] Failed to start: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
