/**
 * Worker lifecycle: START → RUNNING → SHUTTING DOWN → stopped.
 *
 * Reconnect (IMPLEMENTED for Worker only):
 *   On unexpected AMQP connection loss while RUNNING, the Worker schedules a
 *   bounded exponential-backoff reconnect that reasserts topology and recreates
 *   the execution consumer. Shutdown cancels pending reconnect attempts.
 *   The API process does not enable reconnect — it is a request-scoped publisher
 *   and relies on process restart / clear publish failures.
 *
 * In-flight shutdown policy:
 *   Cancel the consumer (stop new deliveries), wait up to WORKER_SHUTDOWN_GRACE_MS
 *   for the current job to finish (prefetch=1), then close channels/connection.
 *   If the grace period expires, close anyway; RabbitMQ may redeliver an unacked
 *   message to another competing consumer.
 */

const http = require('http');
const { loadWorkerConfig, validateWorkerConfig } = require('./config');
const {
  startWorkerMessaging,
  stopWorkerMessaging,
  isWorkerMessagingReady,
  getExecutionConsumer,
} = require('./messaging');
const { processJob } = require('./processor/job-processor');
const { createJudge0Client, describeJudge0Endpoint } = require('./judge0');
const { loadRabbitmqConfig, logMessagingError } = require('@codearena/messaging');

const STATE = Object.freeze({
  STARTING: 'starting',
  RUNNING: 'running',
  RECONNECTING: 'reconnecting',
  SHUTTING_DOWN: 'shutting_down',
  STOPPED: 'stopped',
});

/**
 * @param {{
 *   config?: ReturnType<typeof loadWorkerConfig>,
 *   createHealthServer?: boolean,
 *   onReady?: () => void,
 *   processJobFn?: Function,
 *   judge0Client?: ReturnType<typeof createJudge0Client>,
 *   processorDeps?: Record<string, unknown>,
 * }} [options]
 */
function createWorker(options = {}) {
  const config = validateWorkerConfig(options.config || loadWorkerConfig());
  const judge0Client = options.judge0Client || createJudge0Client(config.judge0);
  const processJobFn = options.processJobFn || ((message) => processJob(message, {
    judge0Client,
    judge0Config: config.judge0,
    ...(options.processorDeps || {}),
  }));
  let state = STATE.STARTING;
  /** @type {import('http').Server | null} */
  let healthServer = null;
  let shuttingDown = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let reconnectGeneration = 0;

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (shuttingDown || state === STATE.SHUTTING_DOWN || state === STATE.STOPPED) {
      return;
    }
    const rabbit = loadRabbitmqConfig();
    if (!rabbit.reconnectEnabled) {
      console.error('[WORKER] RabbitMQ lost; reconnect disabled — exiting for supervisor restart');
      void shutdown('connection_lost', 1);
      return;
    }

    const maxAttempts = rabbit.reconnectMaxAttempts;
    if (maxAttempts > 0 && reconnectAttempt >= maxAttempts) {
      console.error(`[WORKER] RabbitMQ reconnect exhausted after ${reconnectAttempt} attempts — exiting`);
      void shutdown('reconnect_exhausted', 1);
      return;
    }

    state = STATE.RECONNECTING;
    const delay = Math.min(
      rabbit.reconnectMaxDelayMs,
      rabbit.reconnectInitialDelayMs * (2 ** reconnectAttempt),
    );
    reconnectAttempt += 1;
    const generation = reconnectGeneration;
    console.log(
      `[WORKER] Scheduling RabbitMQ reconnect attempt=${reconnectAttempt} delayMs=${delay}`,
    );

    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (generation !== reconnectGeneration || shuttingDown) {
        return;
      }
      void runReconnect(generation);
    }, delay);
    if (typeof reconnectTimer.unref === 'function') {
      reconnectTimer.unref();
    }
  }

  async function runReconnect(generation) {
    if (generation !== reconnectGeneration || shuttingDown) {
      return;
    }
    try {
      console.log(`[WORKER] Reconnecting to RabbitMQ attempt=${reconnectAttempt}`);
      await stopWorkerMessaging({ graceMs: 1_000 }).catch(() => {});
      await startWorkerMessaging(config, {
        onUnexpectedClose: handleUnexpectedClose,
        processJobFn,
      });
      if (generation !== reconnectGeneration || shuttingDown) {
        await stopWorkerMessaging({ graceMs: 1_000 }).catch(() => {});
        return;
      }
      reconnectAttempt = 0;
      state = STATE.RUNNING;
      console.log('[WORKER] RabbitMQ reconnect succeeded; consumer restored');
    } catch (err) {
      logMessagingError('RabbitMQ reconnect failed', err);
      scheduleReconnect();
    }
  }

  function handleUnexpectedClose() {
    if (shuttingDown || state === STATE.SHUTTING_DOWN || state === STATE.STOPPED) {
      return;
    }
    console.error('[WORKER] Detected unexpected RabbitMQ disconnect');
    scheduleReconnect();
  }

  function buildHealthPayload() {
    const consumer = getExecutionConsumer();
    return {
      status: state === STATE.RUNNING && isWorkerMessagingReady() ? 'ok' : 'degraded',
      service: 'worker',
      milestone: config.milestone,
      state,
      messagingReady: isWorkerMessagingReady(),
      consumerActive: Boolean(consumer),
      queue: loadRabbitmqConfig().executionQueue,
      judge0: describeJudge0Endpoint(config.judge0),
    };
  }

  function startHealthServer() {
    if (options.createHealthServer === false || !config.healthEnabled) {
      return null;
    }
    const server = http.createServer((req, res) => {
      if (req.url === '/health' && req.method === 'GET') {
        const payload = buildHealthPayload();
        const statusCode = payload.status === 'ok' ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });
    server.listen(config.port, config.host, () => {
      console.log(`[WORKER] Health server listening on ${config.host}:${config.port}`);
    });
    return server;
  }

  async function start() {
    if (state !== STATE.STARTING && state !== STATE.STOPPED) {
      throw new Error(`Worker cannot start from state=${state}`);
    }
    shuttingDown = false;
    state = STATE.STARTING;
    reconnectGeneration += 1;
    reconnectAttempt = 0;
    clearReconnectTimer();

    console.log(
      `[WORKER] Worker starting service=${config.serviceName} milestone=${config.milestone} ${describeJudge0Endpoint(config.judge0)}`,
    );
    await startWorkerMessaging(config, {
      onUnexpectedClose: handleUnexpectedClose,
      processJobFn,
    });
    healthServer = startHealthServer();
    state = STATE.RUNNING;
    console.log('[WORKER] Worker running');
    if (typeof options.onReady === 'function') {
      options.onReady();
    }
    return getStatus();
  }

  /**
   * @param {string} signal
   * @param {number} [exitCode]
   */
  async function shutdown(signal, exitCode) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    state = STATE.SHUTTING_DOWN;
    reconnectGeneration += 1;
    clearReconnectTimer();
    console.log(`[WORKER] Worker shutting down signal=${signal}`);

    const forceTimer = setTimeout(() => {
      console.error('[WORKER] Forced shutdown after timeout');
      if (exitCode !== undefined) {
        process.exit(exitCode);
      }
    }, config.shutdownGraceMs + 2_000);
    if (typeof forceTimer.unref === 'function') {
      forceTimer.unref();
    }

    try {
      await stopWorkerMessaging({ graceMs: config.shutdownGraceMs });
    } catch (err) {
      logMessagingError('Error during Worker messaging shutdown', err);
    }

    await new Promise((resolve) => {
      if (!healthServer) {
        resolve();
        return;
      }
      healthServer.close(() => resolve());
      healthServer = null;
    });

    clearTimeout(forceTimer);
    state = STATE.STOPPED;
    console.log('[WORKER] Worker stopped');
    if (exitCode !== undefined) {
      process.exit(exitCode);
    }
  }

  function getStatus() {
    return {
      state,
      messagingReady: isWorkerMessagingReady(),
      consumer: getExecutionConsumer(),
      config,
    };
  }

  function setupSignalHandlers() {
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM', 0);
    });
    process.on('SIGINT', () => {
      void shutdown('SIGINT', 0);
    });
  }

  return {
    start,
    shutdown,
    getStatus,
    buildHealthPayload,
    setupSignalHandlers,
    STATE,
  };
}

module.exports = {
  createWorker,
  STATE,
};
