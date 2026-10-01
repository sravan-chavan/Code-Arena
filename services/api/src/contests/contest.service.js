const AppError = require('../errors/AppError');
const contestRepository = require('../repositories/contest.repository');
const participantRepository = require('../repositories/participant.repository');
const questionRepository = require('../repositories/question.repository');
const clock = require('./clock');
const lifecycle = require('./contest.lifecycle');
const sessionService = require('./session.service');
const { trimRequired } = require('../utils/input');
const { withTransaction } = require('../db/transaction');

const { STATUSES } = lifecycle;

function parseOptionalTimestamp(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError(`${field} must be an ISO-8601 timestamp`, 400, { code: 'VALIDATION_ERROR' });
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new AppError(`${field} must be an ISO-8601 timestamp`, 400, { code: 'VALIDATION_ERROR' });
  }
  return new Date(ms).toISOString();
}

function parseDurationMinutes(value, fallback = 60) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AppError('durationMinutes must be a positive integer', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  return parsed;
}

function parseTiming(body, { required = false } = {}) {
  const startTime = parseOptionalTimestamp(body.startTime, 'startTime');
  const explicitEnd = parseOptionalTimestamp(body.endTime, 'endTime');
  const durationProvided = body.durationMinutes !== undefined
    && body.durationMinutes !== null
    && body.durationMinutes !== '';
  const durationMinutes = durationProvided
    ? parseDurationMinutes(body.durationMinutes, null)
    : null;

  if (explicitEnd && !startTime) {
    throw new AppError('startTime is required when endTime is set', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  if (startTime && explicitEnd && Date.parse(explicitEnd) <= Date.parse(startTime)) {
    throw new AppError('endTime must be after startTime', 400, { code: 'VALIDATION_ERROR' });
  }
  if (required && !startTime) {
    throw new AppError('startTime is required', 400, { code: 'VALIDATION_ERROR' });
  }
  if (required && !explicitEnd && !durationMinutes) {
    throw new AppError('endTime or durationMinutes is required', 400, { code: 'VALIDATION_ERROR' });
  }

  let endTime = explicitEnd;
  let duration = durationMinutes;
  if (startTime && explicitEnd) {
    duration = Math.max(1, Math.round((Date.parse(explicitEnd) - Date.parse(startTime)) / 60000));
  } else if (startTime && duration) {
    endTime = new Date(Date.parse(startTime) + duration * 60 * 1000).toISOString();
  }

  return {
    startTime,
    endTime: endTime || null,
    durationMinutes: duration || 60,
  };
}

function present(contest) {
  const nowMs = clock.now();
  const effective = lifecycle.computeEffectiveStatus(contest, nowMs);
  return {
    ...contest,
    storedStatus: contest.status,
    status: effective,
    remainingTime: lifecycle.remainingSeconds(contest, nowMs),
    startsIn: lifecycle.startsInSeconds(contest, nowMs),
    serverTime: clock.isoNow(),
  };
}

function toAdminContest(contest) {
  const viewed = present(contest);
  return {
    ...viewed,
    allowedActions: lifecycle.allowedAdminActions(viewed.status, viewed.storedStatus),
    editableFields: lifecycle.editableFields(viewed.status, viewed.storedStatus),
  };
}

function toStudentContest(contest, participant = null) {
  const viewed = present(contest);
  const { isDevelopmentSeed, createdBy, storedStatus, allowedActions, ...rest } = viewed;
  const eligibility = lifecycle.eligibilityForStudent(viewed.status, participant);
  return {
    ...rest,
    registration: participantRepository.toPublic(participant),
    canRegister: eligibility.canRegister,
    canEnter: eligibility.canEnter,
    eligibilityReason: eligibility.reason,
  };
}

async function requireContest(id) {
  const contest = await contestRepository.findById(id);
  if (!contest) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  return contest;
}

async function syncStoredStatus(contest) {
  const effective = lifecycle.computeEffectiveStatus(contest);
  if (effective === contest.status) {
    return contest;
  }
  if (contest.status === STATUSES.DRAFT || contest.status === STATUSES.CANCELLED) {
    return contest;
  }
  if (contest.status === STATUSES.ENDED) {
    return contest;
  }
  if (effective !== STATUSES.RUNNING && effective !== STATUSES.ENDED && effective !== STATUSES.SCHEDULED) {
    return contest;
  }
  const fields = { status: effective };
  if (effective === STATUSES.ENDED && !contest.endTime) {
    fields.endTime = clock.isoNow();
  }
  const updated = await contestRepository.update(contest.id, fields);
  require('../realtime/notify').contestTransition(updated, contest.status);
  return updated;
}

async function createContest(user, body) {
  const title = trimRequired(body.title, 'title', 120);
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const timing = parseTiming(body || {}, { required: false });

  const contest = await contestRepository.create({
    title,
    description,
    status: STATUSES.DRAFT,
    startTime: timing.startTime,
    endTime: timing.endTime,
    durationMinutes: timing.durationMinutes,
    createdBy: user.id,
  });
  return toAdminContest(contest);
}

async function updateContest(id, body) {
  const contest = await syncStoredStatus(await requireContest(id));
  const effective = lifecycle.computeEffectiveStatus(contest);
  const allowed = lifecycle.editableFields(effective, contest.status);
  if (allowed.length === 0) {
    throw new AppError('This contest can no longer be edited', 409, {
      code: 'INVALID_TRANSITION',
    });
  }

  const fields = {};
  if (body.title !== undefined) {
    if (!allowed.includes('title')) {
      throw new AppError('title cannot be edited in the current contest state', 409, {
        code: 'INVALID_TRANSITION',
      });
    }
    fields.title = trimRequired(body.title, 'title', 120);
  }
  if (body.description !== undefined) {
    if (!allowed.includes('description')) {
      throw new AppError('description cannot be edited in the current contest state', 409, {
        code: 'INVALID_TRANSITION',
      });
    }
    fields.description = typeof body.description === 'string' ? body.description.trim() : '';
  }

  const hasTiming = body.startTime !== undefined
    || body.endTime !== undefined
    || body.durationMinutes !== undefined;
  if (hasTiming) {
    if (!allowed.includes('startTime')) {
      throw new AppError('Timing cannot be changed while the contest is running', 409, {
        code: 'INVALID_TRANSITION',
      });
    }
    const timing = parseTiming({
      startTime: body.startTime !== undefined ? body.startTime : contest.startTime,
      endTime: body.endTime !== undefined ? body.endTime : contest.endTime,
      durationMinutes: body.durationMinutes !== undefined
        ? body.durationMinutes
        : contest.durationMinutes,
    });
    if (effective === STATUSES.SCHEDULED && timing.endTime && Date.parse(timing.endTime) <= clock.now()) {
      throw new AppError('Contest end time must be in the future', 400, {
        code: 'VALIDATION_ERROR',
      });
    }
    fields.startTime = timing.startTime;
    fields.endTime = timing.endTime;
    fields.durationMinutes = timing.durationMinutes;
  }

  const updated = await contestRepository.update(id, fields);
  return toAdminContest(updated);
}

async function scheduleContest(id) {
  const contest = await requireContest(id);
  lifecycle.assertAdminTransition(contest.status, STATUSES.SCHEDULED);

  const timing = parseTiming({
    startTime: contest.startTime,
    endTime: contest.endTime,
    durationMinutes: contest.durationMinutes,
  }, { required: true });

  const endMs = Date.parse(timing.endTime);
  if (endMs <= clock.now()) {
    throw new AppError('Contest end time must be in the future', 400, {
      code: 'VALIDATION_ERROR',
    });
  }

  const updated = await contestRepository.update(id, {
    status: STATUSES.SCHEDULED,
    startTime: timing.startTime,
    endTime: timing.endTime,
    durationMinutes: timing.durationMinutes,
  });
  return toAdminContest(await syncStoredStatus(updated));
}

async function cancelContest(id) {
  const contest = await syncStoredStatus(await requireContest(id));
  const effective = lifecycle.computeEffectiveStatus(contest);
  if (effective === STATUSES.RUNNING || contest.status === STATUSES.RUNNING) {
    throw new AppError('Cannot transition contest from running to cancelled', 409, {
      code: 'INVALID_TRANSITION',
    });
  }
  lifecycle.assertAdminTransition(contest.status, STATUSES.CANCELLED);
  const updated = await contestRepository.update(id, { status: STATUSES.CANCELLED });
  require('../realtime/notify').contestTransition(updated, contest.status);
  return toAdminContest(updated);
}

function parseResumeEndTime(body) {
  const source = body || {};
  const hasEnd = source.endTime !== undefined && source.endTime !== null && source.endTime !== '';
  const hasExtend = source.extendMinutes !== undefined
    && source.extendMinutes !== null
    && source.extendMinutes !== '';
  if (hasEnd === hasExtend) {
    throw new AppError('Provide either endTime or extendMinutes', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  if (hasEnd) {
    const endTime = parseOptionalTimestamp(source.endTime, 'endTime');
    if (Date.parse(endTime) <= clock.now()) {
      throw new AppError('Contest end time must be in the future', 400, {
        code: 'VALIDATION_ERROR',
      });
    }
    return endTime;
  }
  const minutes = Number.parseInt(String(source.extendMinutes), 10);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new AppError('extendMinutes must be a positive integer', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  return new Date(clock.now() + minutes * 60 * 1000).toISOString();
}

async function resumeContest(id, body) {
  const contest = await syncStoredStatus(await requireContest(id));
  if (contest.status !== STATUSES.ENDED) {
    lifecycle.assertAdminTransition(contest.status, STATUSES.RUNNING);
  }
  lifecycle.assertAdminTransition(STATUSES.ENDED, STATUSES.RUNNING);

  const endTime = parseResumeEndTime(body);
  const previousEndTime = contest.endTime;
  const updated = await withTransaction(async (client) => {
    const saved = await contestRepository.update(id, {
      status: STATUSES.RUNNING,
      endTime,
      resumedAt: clock.isoNow(),
    }, client);
    await sessionService.reconcileAfterResume(saved, previousEndTime, client);
    return saved;
  });
  console.log(
    `[API] Contest resumed contestId=${id} endTime=${updated.endTime}`,
  );
  require('../realtime/notify').contestTransition(updated, contest.status);
  return toAdminContest(updated);
}

async function endContest(id) {
  const contest = await syncStoredStatus(await requireContest(id));
  const effective = lifecycle.computeEffectiveStatus(contest);
  if (effective !== STATUSES.RUNNING && contest.status !== STATUSES.RUNNING) {
    lifecycle.assertAdminTransition(contest.status, STATUSES.ENDED);
  }
  const updated = await contestRepository.update(id, {
    status: STATUSES.ENDED,
    endTime: clock.isoNow(),
  });
  require('../realtime/notify').contestTransition(updated, contest.status);
  return toAdminContest(updated);
}

async function listAdminContests() {
  const contests = await contestRepository.listAll();
  return contests.map(toAdminContest);
}

async function getAdminContest(id) {
  const contest = await syncStoredStatus(await requireContest(id));
  return toAdminContest(contest);
}

async function listAdminParticipants(id) {
  await requireContest(id);
  const rows = await participantRepository.listByContestId(id);
  return rows.map(participantRepository.toAdmin);
}

async function listStudentContests(user) {
  const contests = await contestRepository.listVisibleToStudents();
  const registrations = await participantRepository.listByUserId(user.id);
  const byContest = new Map(registrations.map((row) => [row.contestId, row]));
  return contests
    .map((contest) => toStudentContest(contest, byContest.get(contest.id) || null))
    .filter((contest) => contest.status !== STATUSES.DRAFT);
}

async function getStudentContest(user, id) {
  const contest = await syncStoredStatus(await requireContest(id));
  if (contest.status === STATUSES.DRAFT) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  const participant = await participantRepository.findByContestAndUser(id, user.id);
  return toStudentContest(contest, participant);
}

async function registerStudent(user, id) {
  const contest = await syncStoredStatus(await requireContest(id));
  if (contest.status === STATUSES.DRAFT) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  const effective = lifecycle.computeEffectiveStatus(contest);
  if (!lifecycle.canRegister(effective)) {
    throw new AppError(lifecycle.registrationClosedMessage(effective), 409, {
      code: 'REGISTRATION_CLOSED',
    });
  }

  const existing = await participantRepository.findByContestAndUser(id, user.id);
  if (existing) {
    throw new AppError('You are already registered for this contest', 409, {
      code: 'ALREADY_REGISTERED',
    });
  }

  try {
    const created = await participantRepository.create({
      contestId: id,
      userId: user.id,
      status: lifecycle.PARTICIPANT_STATUSES.REGISTERED,
    });
    return participantRepository.toPublic(created);
  } catch (err) {
    if (err && err.code === 'ALREADY_REGISTERED') {
      throw new AppError('You are already registered for this contest', 409, {
        code: 'ALREADY_REGISTERED',
      });
    }
    throw err;
  }
}

async function getStudentRegistration(user, id) {
  const contest = await requireContest(id);
  if (contest.status === STATUSES.DRAFT) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  const participant = await participantRepository.findByContestAndUser(id, user.id);
  return { registration: participantRepository.toPublic(participant) };
}

async function assertArenaAccess(user, contestId) {
  const contest = await syncStoredStatus(await requireContest(contestId));
  if (contest.status === STATUSES.DRAFT) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  const participant = await participantRepository.findByContestAndUser(contestId, user.id);
  const effective = lifecycle.computeEffectiveStatus(contest);
  if (!lifecycle.canEnter(effective, participant)) {
    throw lifecycle.arenaDeniedError(effective, participant);
  }
  return contest;
}

async function assertExecutionAccess(user, question, requestedContestId) {
  if (!question || question.isPractice || !requestedContestId) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const attached = await questionRepository.isAttached(requestedContestId, question.id);
  if (!attached) {
    throw new AppError('Question does not belong to this contest', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  const contest = await syncStoredStatus(await requireContest(requestedContestId));
  if (contest.status === STATUSES.DRAFT) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const existing = await participantRepository.findByContestAndUser(requestedContestId, user.id);
  const effective = lifecycle.computeEffectiveStatus(contest);
  if (existing && lifecycle.isParticipantClosed(existing)) {
    throw lifecycle.executionDeniedError(effective, existing);
  }
  if (!lifecycle.canEnter(effective, existing)) {
    throw lifecycle.executionDeniedError(effective, existing);
  }
  await sessionService.enterContest(user, requestedContestId);
  const participant = await sessionService.requireActiveSession(user, contest, {
    forExecution: true,
  });
  const questionStateRepository = require('../repositories/question-state.repository');
  const state = await questionStateRepository.find(requestedContestId, participant.id, question.id);
  if (state && state.invalidated) {
    throw new AppError('This question has been invalidated for you.', 409, {
      code: 'QUESTION_INVALIDATED',
    });
  }
  return { contest, participant };
}

module.exports = {
  createContest,
  updateContest,
  scheduleContest,
  cancelContest,
  endContest,
  resumeContest,
  listAdminContests,
  getAdminContest,
  listAdminParticipants,
  listStudentContests,
  getStudentContest,
  registerStudent,
  getStudentRegistration,
  assertArenaAccess,
  assertExecutionAccess,
  toAdminContest,
  toStudentContest,
  parseTiming,
};
