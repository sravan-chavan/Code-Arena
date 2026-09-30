const AppError = require('../errors/AppError');
const clock = require('./clock');
const lifecycle = require('./contest.lifecycle');
const scoring = require('./scoring');
const evaluationService = require('./evaluation.service');
const contestRepository = require('../repositories/contest.repository');
const participantRepository = require('../repositories/participant.repository');
const questionRepository = require('../repositories/question.repository');
const questionStateRepository = require('../repositories/question-state.repository');
const violationRepository = require('../repositories/violation.repository');
const { withTransaction } = require('../db/transaction');
const { sumTestCasePoints } = require('./scoring');

const { STATUSES, PARTICIPANT_STATUSES } = lifecycle;

function remainingFromDeadline(deadline, nowMs = clock.now()) {
  const end = lifecycle.parseTimestampMs(deadline);
  if (end == null) {
    return null;
  }
  return Math.max(0, Math.floor((end - nowMs) / 1000));
}

function sessionExpired(participant, nowMs = clock.now()) {
  if (!participant || !participant.effectiveDeadline) {
    return false;
  }
  const remaining = remainingFromDeadline(participant.effectiveDeadline, nowMs);
  return remaining === 0;
}

async function requireContest(id) {
  const contest = await contestRepository.findById(id);
  if (!contest) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  return contest;
}

async function loadLiveContest(id) {
  const contest = await requireContest(id);
  const effective = lifecycle.computeEffectiveStatus(contest);
  if (contest.status === STATUSES.DRAFT) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  return { contest: { ...contest, status: effective, storedStatus: contest.status }, stored: contest };
}

function toSessionPayload(contest, participant, extras = {}) {
  const nowMs = clock.now();
  const remainingSeconds = remainingFromDeadline(participant.effectiveDeadline, nowMs);
  return participantRepository.toSession(participant, {
    serverTime: clock.isoNow(),
    remainingSeconds,
    contestStatus: lifecycle.computeEffectiveStatus(contest, nowMs),
    sessionExpired: remainingSeconds === 0,
    ...extras,
  });
}

async function expireIfNeeded(participant, client) {
  if (!participant || lifecycle.isParticipantClosed(participant)) {
    return participant;
  }
  if (participant.status !== PARTICIPANT_STATUSES.STARTED) {
    return participant;
  }
  if (!sessionExpired(participant)) {
    return participant;
  }
  return participantRepository.update(participant.id, {
    status: PARTICIPANT_STATUSES.COMPLETED,
    completedAt: participant.completedAt || clock.isoNow(),
  }, client);
}

async function enterContest(user, contestId) {
  const { contest, stored } = await loadLiveContest(contestId);
  const participant = await participantRepository.findByContestAndUser(contestId, user.id);
  const effective = lifecycle.computeEffectiveStatus(stored);
  if (!lifecycle.canEnter(effective, participant)) {
    throw lifecycle.arenaDeniedError(effective, participant);
  }

  return withTransaction(async (client) => {
    let current = participant;
    if (current.status === PARTICIPANT_STATUSES.REGISTERED) {
      await participantRepository.markStarted(current.id, client);
      current = await participantRepository.findByContestAndUser(contestId, user.id, client);
    }
    if (!current.effectiveDeadline) {
      const deadline = scoring.computeEffectiveDeadline({
        startedAt: current.startedAt || clock.isoNow(),
        durationMinutes: stored.durationMinutes,
        contestEndTime: stored.endTime,
        contestResolvedEndMs: lifecycle.resolveEndMs(stored),
      });
      current = await participantRepository.update(current.id, {
        effectiveDeadline: deadline,
        startedAt: current.startedAt || clock.isoNow(),
      }, client);
    }
    current = await expireIfNeeded(current, client);
    if (lifecycle.isParticipantClosed(current) && current.status !== PARTICIPANT_STATUSES.COMPLETED) {
      throw lifecycle.arenaDeniedError(effective, current);
    }
    const states = await questionStateRepository.listByParticipant(contestId, current.id, client);
    console.log(
      `[API] Contest session created contestId=${contestId} participantId=${current.id} userId=${user.id}`,
    );
    return toSessionPayload(stored, current, {
      invalidatedQuestionIds: states.filter((row) => row.invalidated).map((row) => row.questionId),
    });
  });
}

async function getSession(user, contestId) {
  const { stored } = await loadLiveContest(contestId);
  const participant = await participantRepository.findByContestAndUser(contestId, user.id);
  if (!participant) {
    throw new AppError('You must register for this contest first.', 403, {
      code: 'REGISTRATION_REQUIRED',
    });
  }
  const current = await expireIfNeeded(participant);
  const states = await questionStateRepository.listByParticipant(contestId, current.id);
  return toSessionPayload(stored, current, {
    invalidatedQuestionIds: states.filter((row) => row.invalidated).map((row) => row.questionId),
  });
}

async function exitContest(user, contestId) {
  const { stored } = await loadLiveContest(contestId);
  const participant = await participantRepository.findByContestAndUser(contestId, user.id);
  if (!participant) {
    throw new AppError('You must register for this contest first.', 403, {
      code: 'REGISTRATION_REQUIRED',
    });
  }
  if (participant.status === PARTICIPANT_STATUSES.REMOVED) {
    throw new AppError('You have been removed from this contest.', 403, {
      code: 'PARTICIPANT_REMOVED',
    });
  }
  if (participant.status === PARTICIPANT_STATUSES.EXITED) {
    return toSessionPayload(stored, participant);
  }
  const updated = await participantRepository.update(participant.id, {
    status: PARTICIPANT_STATUSES.EXITED,
    completedAt: clock.isoNow(),
  });
  console.log(
    `[API] Contest session exited contestId=${contestId} participantId=${updated.id}`,
  );
  return toSessionPayload(stored, updated);
}

async function setCurrentQuestion(user, contestId, questionId) {
  const { stored } = await loadLiveContest(contestId);
  const participant = await requireActiveSession(user, stored, { allowExpired: false });
  const attached = await questionRepository.isAttached(contestId, questionId);
  if (!attached) {
    throw new AppError('Question does not belong to this contest', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  const updated = await participantRepository.update(participant.id, {
    currentQuestionId: questionId,
  });
  return toSessionPayload(stored, updated);
}

async function requireActiveSession(user, contest, { allowExpired = false, forExecution = false } = {}) {
  const participant = await participantRepository.findByContestAndUser(contest.id, user.id);
  const effective = lifecycle.computeEffectiveStatus(contest);
  if (!participant) {
    throw (forExecution
      ? lifecycle.executionDeniedError(effective, participant)
      : lifecycle.arenaDeniedError(effective, participant));
  }
  if (lifecycle.isParticipantClosed(participant)) {
    throw (forExecution
      ? lifecycle.executionDeniedError(effective, participant)
      : lifecycle.arenaDeniedError(effective, participant));
  }
  const current = await expireIfNeeded(participant);
  if (current.status === PARTICIPANT_STATUSES.COMPLETED && !allowExpired) {
    throw new AppError('Your contest time has expired.', forExecution ? 409 : 403, {
      code: 'SESSION_EXPIRED',
    });
  }
  if (!allowExpired && sessionExpired(current)) {
    throw new AppError('Your contest time has expired.', forExecution ? 409 : 403, {
      code: 'SESSION_EXPIRED',
    });
  }
  if (effective !== STATUSES.RUNNING && !allowExpired) {
    throw (forExecution
      ? lifecycle.executionDeniedError(effective, current)
      : lifecycle.arenaDeniedError(effective, current));
  }
  return current;
}

async function reportTabSwitch(user, contestId) {
  const { stored } = await loadLiveContest(contestId);
  const participant = await requireActiveSession(user, stored, { allowExpired: true });
  if (participant.status === PARTICIPANT_STATUSES.REMOVED) {
    throw new AppError('You have been removed from this contest.', 403, {
      code: 'PARTICIPANT_REMOVED',
    });
  }

  return withTransaction(async (client) => {
    const questionId = participant.currentQuestionId || null;
    const sequence = Number(participant.tabSwitchCount || 0) + 1;
    const occurredAt = clock.isoNow();
    const violation = await violationRepository.create({
      contestId,
      participantId: participant.id,
      questionId,
      type: 'TAB_SWITCH',
      sequence,
      metadata: { source: 'visibilitychange' },
    }, client);

    let updated = await participantRepository.update(participant.id, {
      tabSwitchCount: sequence,
      lastTabSwitchAt: occurredAt,
    }, client);

    if (questionId) {
      const testCases = await questionRepository.listTestCases(questionId, client);
      await questionStateRepository.invalidate({
        contestId,
        participantId: participant.id,
        questionId,
        invalidationReason: 'TAB_SWITCH',
        invalidatedAt: occurredAt,
        possiblePoints: sumTestCasePoints(testCases),
      }, client);
      updated = await evaluationService.recomputeParticipant(stored, updated, client);
      console.log(
        `[API] Question invalidated contestId=${contestId} participantId=${updated.id} questionId=${questionId} reason=TAB_SWITCH`,
      );
    }

    console.log(
      `[API] Tab switch detected contestId=${contestId} participantId=${updated.id} questionId=${questionId || 'none'} count=${sequence}`,
    );

    const states = await questionStateRepository.listByParticipant(contestId, updated.id, client);
    return {
      session: toSessionPayload(stored, updated, {
        invalidatedQuestionIds: states.filter((row) => row.invalidated).map((row) => row.questionId),
      }),
      violation,
    };
  });
}

async function removeParticipant(contestId, participantId) {
  const contest = await requireContest(contestId);
  const participant = await participantRepository.findById(participantId);
  if (!participant || participant.contestId !== contestId) {
    throw new AppError('Participant not found', 404, { code: 'NOT_FOUND' });
  }
  if (participant.status === PARTICIPANT_STATUSES.REMOVED) {
    return participantRepository.toAdmin(participant);
  }
  const updated = await participantRepository.update(participant.id, {
    status: PARTICIPANT_STATUSES.REMOVED,
    completedAt: participant.completedAt || clock.isoNow(),
  });
  console.log(
    `[API] Participant removed contestId=${contestId} participantId=${updated.id} userId=${updated.userId}`,
  );
  return participantRepository.toAdmin(updated);
}

async function listViolations(contestId) {
  await requireContest(contestId);
  return violationRepository.listByContest(contestId);
}

module.exports = {
  remainingFromDeadline,
  sessionExpired,
  enterContest,
  getSession,
  exitContest,
  setCurrentQuestion,
  requireActiveSession,
  reportTabSwitch,
  removeParticipant,
  listViolations,
  toSessionPayload,
  expireIfNeeded,
};
