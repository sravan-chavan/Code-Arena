const AppError = require('../errors/AppError');
const clock = require('./clock');

const STATUSES = Object.freeze({
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
});

const STATUS_VALUES = Object.freeze(Object.values(STATUSES));

const PARTICIPANT_STATUSES = Object.freeze({
  REGISTERED: 'registered',
  STARTED: 'started',
  COMPLETED: 'completed',
  REMOVED: 'removed',
  EXITED: 'exited',
});

const EXITED_MESSAGE = 'You exited this contest. You cannot re-enter unless an administrator adds you again.';

/**
 * Admin-triggered transitions of the stored status.
 * Time-based scheduled→running and running→ended are computed, not posted.
 */
const ADMIN_TRANSITIONS = Object.freeze({
  [STATUSES.DRAFT]: Object.freeze([STATUSES.SCHEDULED, STATUSES.CANCELLED]),
  [STATUSES.SCHEDULED]: Object.freeze([STATUSES.CANCELLED]),
  [STATUSES.RUNNING]: Object.freeze([STATUSES.ENDED]),
  [STATUSES.ENDED]: Object.freeze([STATUSES.RUNNING]),
  [STATUSES.CANCELLED]: Object.freeze([]),
});

function isStatus(value) {
  return STATUS_VALUES.includes(value);
}

function parseTimestampMs(value) {
  if (!value) {
    return null;
  }
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function resolveEndMs(contest) {
  const fromEnd = parseTimestampMs(contest.endTime);
  if (fromEnd != null) {
    return fromEnd;
  }
  const startMs = parseTimestampMs(contest.startTime);
  const duration = Number(contest.durationMinutes);
  if (startMs == null || !Number.isInteger(duration) || duration <= 0) {
    return null;
  }
  return startMs + duration * 60 * 1000;
}

/**
 * Effective contest state from stored status + server time.
 * Cancelled, draft, and an explicit ended stored status are sticky.
 * Open-ended contests (no start_time, e.g. the Test seed) keep stored status.
 */
function computeEffectiveStatus(contest, nowMs = clock.now()) {
  const stored = contest && contest.status;
  if (stored === STATUSES.CANCELLED) {
    return STATUSES.CANCELLED;
  }
  if (stored === STATUSES.DRAFT) {
    return STATUSES.DRAFT;
  }
  if (stored === STATUSES.ENDED) {
    return STATUSES.ENDED;
  }

  const startMs = parseTimestampMs(contest && contest.startTime);
  if (startMs == null) {
    return isStatus(stored) ? stored : STATUSES.DRAFT;
  }

  if (nowMs < startMs) {
    return STATUSES.SCHEDULED;
  }
  const endMs = resolveEndMs(contest);
  if (endMs != null && nowMs >= endMs) {
    return STATUSES.ENDED;
  }
  return STATUSES.RUNNING;
}

function remainingSeconds(contest, nowMs = clock.now()) {
  if (computeEffectiveStatus(contest, nowMs) !== STATUSES.RUNNING) {
    return null;
  }
  const endMs = resolveEndMs(contest);
  if (endMs == null) {
    return null;
  }
  return Math.max(0, Math.floor((endMs - nowMs) / 1000));
}

function startsInSeconds(contest, nowMs = clock.now()) {
  if (computeEffectiveStatus(contest, nowMs) !== STATUSES.SCHEDULED) {
    return null;
  }
  const startMs = parseTimestampMs(contest && contest.startTime);
  if (startMs == null) {
    return null;
  }
  return Math.max(0, Math.floor((startMs - nowMs) / 1000));
}

function assertAdminTransition(fromStored, toStatus) {
  const allowed = ADMIN_TRANSITIONS[fromStored] || [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(
      `Cannot transition contest from ${fromStored} to ${toStatus}`,
      409,
      { code: 'INVALID_TRANSITION' },
    );
  }
}

/**
 * Registration is open while the contest is SCHEDULED or RUNNING.
 * DRAFT, ENDED, and CANCELLED cannot be registered for.
 */
function canRegister(effectiveStatus) {
  return effectiveStatus === STATUSES.SCHEDULED || effectiveStatus === STATUSES.RUNNING;
}

function isParticipantClosed(participant) {
  if (!participant) {
    return false;
  }
  return participant.status === PARTICIPANT_STATUSES.REMOVED
    || participant.status === PARTICIPANT_STATUSES.EXITED;
}

function canEnter(effectiveStatus, participant) {
  if (!participant || isParticipantClosed(participant)) {
    return false;
  }
  return effectiveStatus === STATUSES.RUNNING;
}

function allowedAdminActions(effectiveStatus, storedStatus) {
  if (storedStatus === STATUSES.DRAFT || effectiveStatus === STATUSES.DRAFT) {
    return ['update', 'schedule', 'cancel'];
  }
  if (effectiveStatus === STATUSES.SCHEDULED) {
    return ['update', 'cancel'];
  }
  if (effectiveStatus === STATUSES.RUNNING) {
    return ['update', 'end'];
  }
  if (storedStatus === STATUSES.ENDED || effectiveStatus === STATUSES.ENDED) {
    return ['resume'];
  }
  return [];
}

function editableFields(effectiveStatus, storedStatus) {
  if (storedStatus === STATUSES.DRAFT || effectiveStatus === STATUSES.DRAFT) {
    return ['title', 'description', 'startTime', 'endTime', 'durationMinutes'];
  }
  if (effectiveStatus === STATUSES.SCHEDULED) {
    return ['title', 'description', 'startTime', 'endTime', 'durationMinutes'];
  }
  if (effectiveStatus === STATUSES.RUNNING) {
    return ['title', 'description'];
  }
  return [];
}

function eligibilityForStudent(effectiveStatus, participant) {
  if (participant && participant.status === PARTICIPANT_STATUSES.REMOVED) {
    return {
      canRegister: false,
      canEnter: false,
      reason: 'You have been removed from this contest.',
    };
  }
  if (participant && participant.status === PARTICIPANT_STATUSES.EXITED) {
    return {
      canRegister: false,
      canEnter: false,
      reason: EXITED_MESSAGE,
    };
  }
  if (participant) {
    if (effectiveStatus === STATUSES.RUNNING) {
      return { canRegister: false, canEnter: true, reason: null };
    }
    if (effectiveStatus === STATUSES.SCHEDULED) {
      return {
        canRegister: false,
        canEnter: false,
        reason: 'Contest has not started yet.',
      };
    }
    if (effectiveStatus === STATUSES.ENDED) {
      return { canRegister: false, canEnter: false, reason: 'This contest has ended.' };
    }
    if (effectiveStatus === STATUSES.CANCELLED) {
      return {
        canRegister: false,
        canEnter: false,
        reason: 'This contest has been cancelled.',
      };
    }
    return { canRegister: false, canEnter: false, reason: 'Registration is not open.' };
  }

  if (canRegister(effectiveStatus)) {
    return {
      canRegister: true,
      canEnter: false,
      reason: 'You must register for this contest first.',
    };
  }
  if (effectiveStatus === STATUSES.ENDED) {
    return { canRegister: false, canEnter: false, reason: 'This contest has ended.' };
  }
  if (effectiveStatus === STATUSES.CANCELLED) {
    return {
      canRegister: false,
      canEnter: false,
      reason: 'This contest has been cancelled.',
    };
  }
  return { canRegister: false, canEnter: false, reason: 'Registration is not open.' };
}

function registrationClosedMessage(effectiveStatus) {
  if (effectiveStatus === STATUSES.DRAFT) {
    return 'Registration is not open.';
  }
  if (effectiveStatus === STATUSES.ENDED) {
    return 'This contest has ended.';
  }
  if (effectiveStatus === STATUSES.CANCELLED) {
    return 'This contest has been cancelled.';
  }
  return 'Registration is not open.';
}

function arenaDeniedError(effectiveStatus, participant) {
  if (!participant) {
    return new AppError('You must register for this contest first.', 403, {
      code: 'REGISTRATION_REQUIRED',
    });
  }
  if (participant.status === PARTICIPANT_STATUSES.REMOVED) {
    return new AppError('You have been removed from this contest.', 403, {
      code: 'PARTICIPANT_REMOVED',
    });
  }
  if (participant.status === PARTICIPANT_STATUSES.EXITED) {
    return new AppError(EXITED_MESSAGE, 403, {
      code: 'SESSION_ENDED',
    });
  }
  if (effectiveStatus === STATUSES.SCHEDULED) {
    return new AppError('Contest has not started yet.', 403, {
      code: 'CONTEST_NOT_STARTED',
    });
  }
  if (effectiveStatus === STATUSES.ENDED) {
    return new AppError('This contest has ended.', 403, { code: 'CONTEST_ENDED' });
  }
  if (effectiveStatus === STATUSES.CANCELLED) {
    return new AppError('This contest has been cancelled.', 403, {
      code: 'CONTEST_CANCELLED',
    });
  }
  return new AppError('Contest is not open for execution', 403, {
    code: 'CONTEST_NOT_RUNNING',
  });
}

/**
 * Resume deadline rule.
 *
 * The admin chooses the new contest end. startTime and durationMinutes stay.
 * Exited and removed participants are left untouched.
 * A participant who has not started is left untouched; enter computes
 * min(start + duration, new contest end).
 * A started participant who still has a personal deadline inside the new
 * window keeps it, capped at the new contest end.
 * A started participant whose deadline has passed because the contest clock
 * stopped them (deadline at or after the previous contest end) is moved to
 * the new contest end. If that end is in the future, completed becomes started.
 * A personal deadline that expired while the contest was still open is not extended.
 * Score, penalty, submissions, violations, and question invalidation are not inputs.
 */
function nextParticipantStateAfterResume(participant, { previousEndTime, newEndTime, nowMs }) {
  if (!participant) {
    return null;
  }
  if (
    participant.status === PARTICIPANT_STATUSES.EXITED
    || participant.status === PARTICIPANT_STATUSES.REMOVED
  ) {
    return null;
  }
  if (!participant.startedAt) {
    return null;
  }

  const currentMs = parseTimestampMs(participant.effectiveDeadline);
  const newEndMs = parseTimestampMs(newEndTime);
  const previousEndMs = parseTimestampMs(previousEndTime);
  let deadline = participant.effectiveDeadline;

  if (currentMs != null && currentMs > nowMs) {
    if (newEndMs != null && currentMs > newEndMs) {
      deadline = newEndTime;
    }
  } else {
    const contestStoppedThem = previousEndMs == null
      || currentMs == null
      || currentMs >= previousEndMs - 1000;
    if (contestStoppedThem && newEndMs != null && newEndMs > nowMs) {
      deadline = newEndTime;
    }
  }

  let status = participant.status;
  let completedAt = participant.completedAt || null;
  const deadlineMs = parseTimestampMs(deadline);
  if (
    deadlineMs != null
    && deadlineMs > nowMs
    && status === PARTICIPANT_STATUSES.COMPLETED
  ) {
    status = PARTICIPANT_STATUSES.STARTED;
    completedAt = null;
  }

  if (
    deadline === participant.effectiveDeadline
    && status === participant.status
    && completedAt === (participant.completedAt || null)
  ) {
    return null;
  }

  return {
    effectiveDeadline: deadline,
    status,
    completedAt,
  };
}

/**
 * Re-add restores the same participant row. It does not clear exitedAt,
 * submissions, score, penalty, or violations. A past deadline is aligned to
 * the current contest end only while the contest is running.
 */
function nextParticipantStateAfterReadd(participant, contest, nowMs = clock.now()) {
  if (!participant || participant.status !== PARTICIPANT_STATUSES.EXITED) {
    return null;
  }
  const status = participant.startedAt
    ? PARTICIPANT_STATUSES.STARTED
    : PARTICIPANT_STATUSES.REGISTERED;
  let effectiveDeadline = participant.effectiveDeadline;
  if (computeEffectiveStatus(contest, nowMs) === STATUSES.RUNNING) {
    const deadlineMs = parseTimestampMs(participant.effectiveDeadline);
    const contestEndMs = resolveEndMs(contest);
    if ((deadlineMs == null || deadlineMs <= nowMs) && contestEndMs != null && contestEndMs > nowMs) {
      effectiveDeadline = new Date(contestEndMs).toISOString();
    } else if (deadlineMs != null && contestEndMs != null && deadlineMs > contestEndMs) {
      effectiveDeadline = new Date(contestEndMs).toISOString();
    }
  }
  return {
    status,
    effectiveDeadline,
    completedAt: null,
  };
}

function executionDeniedError(effectiveStatus, participant) {
  if (!participant) {
    return new AppError('You must register for this contest first.', 403, {
      code: 'REGISTRATION_REQUIRED',
    });
  }
  if (participant.status === PARTICIPANT_STATUSES.REMOVED) {
    return new AppError('You have been removed from this contest.', 403, {
      code: 'PARTICIPANT_REMOVED',
    });
  }
  if (participant.status === PARTICIPANT_STATUSES.EXITED) {
    return new AppError(EXITED_MESSAGE, 409, {
      code: 'SESSION_ENDED',
    });
  }
  if (effectiveStatus === STATUSES.SCHEDULED) {
    return new AppError('Contest has not started yet.', 409, {
      code: 'CONTEST_NOT_STARTED',
    });
  }
  if (effectiveStatus === STATUSES.ENDED) {
    return new AppError('This contest has ended.', 409, { code: 'CONTEST_ENDED' });
  }
  if (effectiveStatus === STATUSES.CANCELLED) {
    return new AppError('This contest has been cancelled.', 409, {
      code: 'CONTEST_CANCELLED',
    });
  }
  return new AppError('Contest is not open for execution', 409, {
    code: 'CONTEST_NOT_RUNNING',
  });
}

module.exports = {
  STATUSES,
  STATUS_VALUES,
  PARTICIPANT_STATUSES,
  EXITED_MESSAGE,
  ADMIN_TRANSITIONS,
  isStatus,
  parseTimestampMs,
  resolveEndMs,
  computeEffectiveStatus,
  remainingSeconds,
  startsInSeconds,
  assertAdminTransition,
  isParticipantClosed,
  canRegister,
  canEnter,
  allowedAdminActions,
  editableFields,
  eligibilityForStudent,
  registrationClosedMessage,
  arenaDeniedError,
  executionDeniedError,
  nextParticipantStateAfterResume,
  nextParticipantStateAfterReadd,
};
