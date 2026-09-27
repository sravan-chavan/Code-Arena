/**
 * Execution job payload contract (M6).
 *
 * Envelope (M5, unchanged):
 *   { messageId, type, version, occurredAt, payload }
 *
 * type must be codearena.execution.requested.
 *
 * Payload fields for M6:
 *   required:
 *     jobId — UUID identifying the processing unit (not the AMQP messageId)
 *   optional:
 *     disposition — 'fail' forces a processor failure for tests/ops probes
 *     note — free-form operational note (not logged verbatim)
 *   intentionally deferred (M7+):
 *     submissionId, problemId, language, sourceCode, stdin, timeLimitMs,
 *     memoryLimitKb, expectedOutput, contestId, userId
 *
 * M6 validates shape only. It does not execute code.
 */

const {
  MessageContractError,
  UUID_PATTERN,
  isPlainObject,
  MESSAGE_TYPES,
} = require('@codearena/messaging');

/**
 * @param {unknown} message
 * @returns {{ jobId: string, disposition: string | null, note: string | null }}
 */
function validateExecutionJob(message) {
  if (!isPlainObject(message)) {
    throw new MessageContractError('Execution job message must be a plain object');
  }
  if (message.type !== MESSAGE_TYPES.EXECUTION_REQUESTED) {
    throw new MessageContractError(
      `Unsupported message type for execution processor: ${String(message.type)}`,
    );
  }
  if (!isPlainObject(message.payload)) {
    throw new MessageContractError('Execution job payload must be a plain object');
  }

  const { jobId, disposition, note } = message.payload;
  if (typeof jobId !== 'string' || !UUID_PATTERN.test(jobId)) {
    throw new MessageContractError('payload.jobId must be a UUID');
  }
  if (disposition !== undefined && disposition !== null) {
    if (typeof disposition !== 'string') {
      throw new MessageContractError('payload.disposition must be a string when provided');
    }
    if (disposition !== 'fail' && disposition !== 'succeed') {
      throw new MessageContractError('payload.disposition must be "fail" or "succeed" when provided');
    }
  }
  if (note !== undefined && note !== null && typeof note !== 'string') {
    throw new MessageContractError('payload.note must be a string when provided');
  }

  return Object.freeze({
    jobId,
    disposition: disposition === undefined || disposition === null ? null : disposition,
    note: note === undefined || note === null ? null : note,
  });
}

module.exports = {
  validateExecutionJob,
};
