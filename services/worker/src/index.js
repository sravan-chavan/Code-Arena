/**
 * CodeArena Worker service entrypoint (Milestone 7).
 *
 * Owns RabbitMQ execution consumption, Judge0 submission + polling, job
 * processing, lifecycle, and graceful shutdown. Does not execute user code
 * inside this process — Judge0 is the sandbox.
 */

const { createWorker } = require('./lifecycle');
const { loadRabbitmqConfig } = require('@codearena/messaging');
const { describeJudge0Endpoint } = require('./judge0');

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
  const workerStatus = worker.getStatus();
  console.log(
    `[WORKER] Ready queue=${rabbit.executionQueue} prefetch=${rabbit.prefetch} reconnect=${rabbit.reconnectEnabled} ${describeJudge0Endpoint(workerStatus.config.judge0)}`,
  );
}

main().catch((err) => {
  console.error(`[WORKER] Failed to start: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
