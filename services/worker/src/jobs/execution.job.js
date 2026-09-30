/**
 * Execution job payload contract (M6 envelope + M7 Judge0 fields).
 *
 * Envelope (M5, unchanged):
 *   { messageId, type, version, occurredAt, payload }
 *
 * type must be codearena.execution.requested.
 *
 * Payload fields:
 *   required:
 *     jobId — UUID identifying the processing unit (not the AMQP messageId)
 *   required for Judge0 execution (when disposition is not "fail"):
 *     sourceCode — program text submitted to Judge0 (never logged)
 *     languageId — Judge0 language_id (positive integer)
 *   optional:
 *     stdin — stdin passed to Judge0
 *     expectedOutput — Judge0 expected_output (enables Wrong Answer vs Accepted)
 *     cpuTimeLimit — Judge0 cpu_time_limit in seconds
 *     memoryLimit — Judge0 memory_limit in kilobytes
 *     disposition — 'fail' forces a processor failure for tests/ops probes
 *     note — free-form operational note (not logged verbatim)
 *
 * Intentionally deferred (M8+):
 *     submissionId, problemId, contestId, userId
 *
 * This module validates shape only. It does not call Judge0.
 */

const {
  MessageContractError,
  UUID_PATTERN,
  isPlainObject,
  MESSAGE_TYPES,
} = require('@codearena/messaging');

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string | null}
 */
function optionalString(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new MessageContractError(`payload.${field} must be a string when provided`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number | null}
 */
function optionalPositiveNumber(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new MessageContractError(`payload.${field} must be a positive number when provided`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number | null}
 */
function optionalPositiveInteger(value, field) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new MessageContractError(`payload.${field} must be a positive integer when provided`);
  }
  return value;
}

/**
 * @param {unknown} message
 * @returns {{
 *   jobId: string,
 *   disposition: string | null,
 *   note: string | null,
 *   sourceCode: string | null,
 *   languageId: number | null,
 *   stdin: string | null,
 *   expectedOutput: string | null,
 *   cpuTimeLimit: number | null,
 *   memoryLimit: number | null,
 * }}
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

  const {
    jobId,
    disposition,
    note,
    sourceCode,
    languageId,
    stdin,
    expectedOutput,
    cpuTimeLimit,
    memoryLimit,
  } = message.payload;

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

  const resolvedDisposition = disposition === undefined || disposition === null ? null : disposition;
  const resolvedSourceCode = optionalString(sourceCode, 'sourceCode');
  const resolvedLanguageId = optionalPositiveInteger(languageId, 'languageId');
  const resolvedStdin = optionalString(stdin, 'stdin');
  const resolvedExpectedOutput = optionalString(expectedOutput, 'expectedOutput');
  const resolvedCpuTimeLimit = optionalPositiveNumber(cpuTimeLimit, 'cpuTimeLimit');
  const resolvedMemoryLimit = optionalPositiveInteger(memoryLimit, 'memoryLimit');
  const resolvedTestCases = optionalTestCases(message.payload.testCases);

  // disposition=fail remains an M6 processor probe and does not require Judge0 fields.
  if (resolvedDisposition !== 'fail') {
    if (resolvedSourceCode === null || resolvedSourceCode.length === 0) {
      throw new MessageContractError('payload.sourceCode is required for Judge0 execution');
    }
    if (resolvedLanguageId === null) {
      throw new MessageContractError('payload.languageId is required for Judge0 execution');
    }
  }

  return Object.freeze({
    jobId,
    disposition: resolvedDisposition,
    note: note === undefined || note === null ? null : note,
    sourceCode: resolvedSourceCode,
    languageId: resolvedLanguageId,
    stdin: resolvedStdin,
    expectedOutput: resolvedExpectedOutput,
    cpuTimeLimit: resolvedCpuTimeLimit,
    memoryLimit: resolvedMemoryLimit,
    testCases: resolvedTestCases,
  });
}

function optionalTestCases(value) {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new MessageContractError('payload.testCases must be an array when provided');
  }
  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new MessageContractError(`payload.testCases[${index}] must be an object`);
    }
    return Object.freeze({
      id: typeof entry.id === 'string' ? entry.id : null,
      stdin: typeof entry.stdin === 'string' ? entry.stdin : '',
      expectedOutput: typeof entry.expectedOutput === 'string' ? entry.expectedOutput : '',
      points: Number.isInteger(entry.points) && entry.points > 0 ? entry.points : 10,
      isHidden: Boolean(entry.isHidden),
      sortOrder: Number.isInteger(entry.sortOrder) ? entry.sortOrder : index,
    });
  });
}

module.exports = {
  validateExecutionJob,
};
