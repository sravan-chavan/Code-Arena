/**
 * Job processor — Worker processing boundary.
 *
 * M6 flow:
 *   consumer → processJob → validateExecutionJob → processExecutionJob
 *
 * M7 will insert a Judge0 adapter behind processExecutionJob without rewriting
 * the RabbitMQ consumer or acknowledgement strategy.
 *
 * This module must not ack/reject AMQP messages or open RabbitMQ channels.
 */

const { MESSAGE_TYPES, MessageContractError } = require('@codearena/messaging');
const { validateExecutionJob } = require('../jobs/execution.job');

/**
 * @param {{ messageId: string, type: string, version: number, occurredAt: string, payload: Record<string, unknown> }} message
 * @param {{ processExecution?: typeof processExecutionJob }} [deps]
 */
async function processJob(message, deps = {}) {
  const started = Date.now();
  console.log(
    `[WORKER] Job processing started messageId=${message && message.messageId} type=${message && message.type}`,
  );

  if (!message || message.type !== MESSAGE_TYPES.EXECUTION_REQUESTED) {
    throw new MessageContractError(
      `Unsupported message type for Worker processor: ${String(message && message.type)}`,
    );
  }

  const job = validateExecutionJob(message);
  const run = deps.processExecution || processExecutionJob;
  const result = await run(job, message);

  const durationMs = Date.now() - started;
  console.log(
    `[WORKER] Job processing succeeded messageId=${message.messageId} jobId=${job.jobId} durationMs=${durationMs}`,
  );
  return result;
}

/**
 * M6 processing boundary. Intentionally no Judge0, compilation, or sandbox.
 *
 * @param {{ jobId: string, disposition: string | null, note: string | null }} job
 * @param {{ messageId: string, type: string }} message
 */
async function processExecutionJob(job, message) {
  if (job.disposition === 'fail') {
    const error = new Error('Execution job intentionally failed');
    error.code = 'EXECUTION_JOB_FAILED';
    console.error(
      `[WORKER] Job processing failed messageId=${message.messageId} jobId=${job.jobId} code=${error.code}`,
    );
    throw error;
  }

  // Processing boundary for M7: replace this body with Judge0 adapter calls.
  return Object.freeze({
    status: 'accepted',
    jobId: job.jobId,
    messageId: message.messageId,
    milestone: 6,
  });
}

module.exports = {
  processJob,
  processExecutionJob,
};
