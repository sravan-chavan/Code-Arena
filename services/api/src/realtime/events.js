const { randomUUID } = require('crypto');

/** WebSocket event envelope version. Version 2 may be added later without reusing this shape. */
const EVENT_VERSION = 1;

const EVENT_TYPES = Object.freeze({
  CONTEST_STARTED: 'contest.started',
  CONTEST_ENDING: 'contest.ending',
  CONTEST_ENDED: 'contest.ended',
  CONTEST_CANCELLED: 'contest.cancelled',
  SUBMISSION_QUEUED: 'submission.queued',
  SUBMISSION_EVALUATING: 'submission.evaluating',
  SUBMISSION_COMPLETED: 'submission.completed',
  SUBMISSION_FAILED: 'submission.failed',
  SUBMISSION_SCORE_UPDATED: 'submission.score.updated',
  PARTICIPANT_SCORE_UPDATED: 'participant.score.updated',
  CONTEST_RANKING_UPDATED: 'contest.ranking.updated',
  PARTICIPANT_REMOVED: 'participant.removed',
  PARTICIPANT_STATUS_UPDATED: 'participant.status.updated',
  CONTEST_SESSION_INVALIDATED: 'contest.session.invalidated',
  CONTEST_VIOLATION_DETECTED: 'contest.violation.detected',
  SYSTEM_AUTHENTICATED: 'system.authenticated',
  SYSTEM_SUBSCRIBED: 'system.subscribed',
  SYSTEM_UNSUBSCRIBED: 'system.unsubscribed',
  SYSTEM_ERROR: 'system.error',
});

const KNOWN_EVENT_TYPES = Object.freeze(new Set(Object.values(EVENT_TYPES)));

const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  'sourcecode',
  'password',
  'passwordhash',
  'jwt',
  'accesstoken',
  'refreshtoken',
  'stdin',
  'expectedoutput',
  'hiddeninput',
  'hiddenoutput',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isKnownEventType(type) {
  return KNOWN_EVENT_TYPES.has(type);
}

/**
 * Rejects payloads that would leak source, secrets, or hidden tests.
 * @param {unknown} value
 * @param {string} path
 */
function assertSafePayload(value, path = 'payload') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafePayload(entry, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.includes(key.toLowerCase())) {
      const error = new Error(`${path}.${key} must not be published on the realtime channel`);
      error.code = 'UNSAFE_REALTIME_PAYLOAD';
      throw error;
    }
    assertSafePayload(nested, `${path}.${key}`);
  }
}

/**
 * @param {{ type: string, payload?: Record<string, unknown>, contestId?: string | null, eventId?: string, occurredAt?: string, version?: number }} input
 */
function createEvent(input) {
  if (!isPlainObject(input)) {
    throw new Error('Event input must be a plain object');
  }
  if (!isKnownEventType(input.type)) {
    throw new Error(`Unknown realtime event type: ${String(input.type)}`);
  }
  const version = input.version === undefined ? EVENT_VERSION : input.version;
  if (version !== EVENT_VERSION) {
    throw new Error(`Unsupported realtime event version: ${String(version)}`);
  }
  const payload = input.payload === undefined ? {} : input.payload;
  if (!isPlainObject(payload)) {
    throw new Error('Event payload must be a plain object');
  }
  assertSafePayload(payload);
  const contestId = input.contestId === undefined ? null : input.contestId;
  if (contestId !== null && (typeof contestId !== 'string' || !UUID_PATTERN.test(contestId))) {
    throw new Error('contestId must be a UUID when set');
  }
  const occurredAt = input.occurredAt || new Date().toISOString();
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new Error('occurredAt must be an ISO-8601 timestamp');
  }
  const eventId = input.eventId || randomUUID();
  if (!UUID_PATTERN.test(eventId)) {
    throw new Error('eventId must be a UUID');
  }
  return Object.freeze({
    eventId,
    type: input.type,
    version,
    occurredAt,
    contestId,
    payload: Object.freeze({ ...payload }),
  });
}

function rankingPayload(rows, snapshotMax) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length > snapshotMax) {
    return {
      mode: 'invalidate',
      participantCount: list.length,
    };
  }
  return {
    mode: 'snapshot',
    ranking: list.map((row) => {
      const { email, ...rest } = row || {};
      return rest;
    }),
  };
}

const TERMINAL_FAILURE = new Set(['INTERNAL_ERROR']);

function submissionEventType(status) {
  if (TERMINAL_FAILURE.has(status)) {
    return EVENT_TYPES.SUBMISSION_FAILED;
  }
  return EVENT_TYPES.SUBMISSION_COMPLETED;
}

module.exports = {
  EVENT_VERSION,
  EVENT_TYPES,
  KNOWN_EVENT_TYPES,
  UUID_PATTERN,
  isKnownEventType,
  isPlainObject,
  assertSafePayload,
  createEvent,
  rankingPayload,
  submissionEventType,
};
