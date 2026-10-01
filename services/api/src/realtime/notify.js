/**
 * Domain notifications. Callers pass already-persisted records.
 * Failures are logged and never rolled back into the business transaction.
 */

const participantRepository = require('../repositories/participant.repository');
const rankingService = require('../contests/ranking.service');
const submissionRepository = require('../repositories/submission.repository');
const dispatcher = require('./dispatcher');
const { loadRealtimeConfig } = require('./config');
const {
  EVENT_TYPES,
  createEvent,
  rankingPayload,
  submissionEventType,
} = require('./events');

const announcedStatus = new Map();
const announcedEnding = new Set();

function safe(work) {
  try {
    const result = work();
    if (result && typeof result.then === 'function') {
      return result.catch((err) => {
        console.error(`[API] Realtime notify failed: ${err.message}`);
        return null;
      });
    }
    return result;
  } catch (err) {
    console.error(`[API] Realtime notify failed: ${err.message}`);
    return null;
  }
}

function emit(type, { contestId = null, payload = {}, delivery }) {
  const envelope = createEvent({ type, contestId, payload });
  dispatcher.publish({ envelope, delivery });
  return envelope;
}

function ownerSummary(submission) {
  const pub = submissionRepository.toPublic(submission, { includeHiddenResults: false });
  return {
    submissionId: pub.id,
    contestId: pub.contestId,
    participantId: pub.participantId,
    questionId: pub.questionId,
    kind: pub.kind,
    status: pub.status,
    score: pub.score,
    testsPassed: pub.testsPassed,
    testsTotal: pub.testsTotal,
    executionTime: pub.executionTime,
    memoryKb: pub.memoryKb,
    stdout: pub.stdout,
    stderr: pub.stderr,
    compileOutput: pub.compileOutput,
    message: pub.message,
    testResults: pub.testResults || [],
    createdAt: pub.createdAt,
    evaluatedAt: pub.evaluatedAt,
  };
}

function adminSummary(submission) {
  return {
    submissionId: submission.id,
    contestId: submission.contestId,
    participantId: submission.participantId,
    userId: submission.userId,
    questionId: submission.questionId,
    kind: submission.kind,
    status: submission.status,
    score: submission.score,
    testsPassed: submission.testsPassed,
    testsTotal: submission.testsTotal,
    createdAt: submission.createdAt,
    evaluatedAt: submission.evaluatedAt,
  };
}

function emitSubmission(type, submission) {
  if (!submission) {
    return;
  }
  emit(type, {
    contestId: submission.contestId,
    payload: ownerSummary(submission),
    delivery: {
      contestId: submission.contestId,
      ownerUserId: submission.userId,
      scopes: ['owner'],
    },
  });
  if (submission.contestId) {
    emit(type, {
      contestId: submission.contestId,
      payload: adminSummary(submission),
      delivery: {
        contestId: submission.contestId,
        scopes: ['admins'],
      },
    });
  }
}

function submissionQueued(submission) {
  return safe(() => emitSubmission(EVENT_TYPES.SUBMISSION_QUEUED, submission));
}

function submissionEvaluating(submission) {
  return safe(() => emitSubmission(EVENT_TYPES.SUBMISSION_EVALUATING, submission));
}

function participantScore(participant) {
  if (!participant) {
    return null;
  }
  return safe(() => emit(EVENT_TYPES.PARTICIPANT_SCORE_UPDATED, {
    contestId: participant.contestId,
    payload: {
      participantId: participant.id,
      score: participant.score,
      penalty: participant.penalty,
      possibleScore: participant.possibleScore,
      solvedCount: participant.solvedCount,
      status: participant.status,
    },
    delivery: {
      contestId: participant.contestId,
      ownerUserId: participant.userId,
      scopes: ['owner', 'admins'],
    },
  }));
}

async function rankingUpdated(contestId) {
  if (!contestId) {
    return null;
  }
  return safe(async () => {
    const config = loadRealtimeConfig();
    const rows = await rankingService.rankingForContest(contestId, { includeEmail: false });
    return emit(EVENT_TYPES.CONTEST_RANKING_UPDATED, {
      contestId,
      payload: rankingPayload(rows, config.rankingSnapshotMax),
      delivery: { contestId, scopes: ['contest'] },
    });
  });
}

async function submissionFinished(submission) {
  if (!submission) {
    return null;
  }
  return safe(async () => {
    const type = submissionEventType(submission.status);
    emitSubmission(type, submission);
    if (submission.contestId && submission.kind === 'submit') {
      emit(EVENT_TYPES.SUBMISSION_SCORE_UPDATED, {
        contestId: submission.contestId,
        payload: {
          submissionId: submission.id,
          questionId: submission.questionId,
          participantId: submission.participantId,
          score: submission.score,
          status: submission.status,
        },
        delivery: {
          contestId: submission.contestId,
          ownerUserId: submission.userId,
          scopes: ['owner', 'admins'],
        },
      });
      if (submission.participantId) {
        const participant = await participantRepository.findById(submission.participantId);
        participantScore(participant);
      }
      await rankingUpdated(submission.contestId);
    }
    return true;
  });
}

function contestPayload(contest, extra = {}) {
  return {
    status: contest.status,
    startTime: contest.startTime || null,
    endTime: contest.endTime || null,
    resumedAt: contest.resumedAt || null,
    serverTime: new Date().toISOString(),
    ...extra,
  };
}

function contestTransition(contest, previousStatus) {
  if (!contest || !contest.id) {
    return null;
  }
  return safe(() => {
    const next = contest.status;
    if (announcedStatus.get(contest.id) === next) {
      return null;
    }
    let type = null;
    if (next === 'running' && previousStatus !== 'running') {
      type = EVENT_TYPES.CONTEST_STARTED;
    } else if (next === 'ended') {
      type = EVENT_TYPES.CONTEST_ENDED;
    } else if (next === 'cancelled') {
      type = EVENT_TYPES.CONTEST_CANCELLED;
    }
    if (!type) {
      return null;
    }
    if (next === 'running') {
      announcedEnding.delete(contest.id);
    }
    announcedStatus.set(contest.id, next);
    if (announcedStatus.size > 2000) {
      const oldest = announcedStatus.keys().next().value;
      announcedStatus.delete(oldest);
    }
    return emit(type, {
      contestId: contest.id,
      payload: contestPayload(contest),
      delivery: { contestId: contest.id, scopes: ['contest'] },
    });
  });
}

function contestEnding(contest, remainingSeconds) {
  if (!contest || !contest.id) {
    return null;
  }
  return safe(() => {
    if (announcedEnding.has(contest.id)) {
      return null;
    }
    announcedEnding.add(contest.id);
    if (announcedEnding.size > 2000) {
      const oldest = announcedEnding.values().next().value;
      announcedEnding.delete(oldest);
    }
    return emit(EVENT_TYPES.CONTEST_ENDING, {
      contestId: contest.id,
      payload: contestPayload(contest, { remainingSeconds }),
      delivery: { contestId: contest.id, scopes: ['contest'] },
    });
  });
}

function participantRemoved(participant) {
  if (!participant) {
    return null;
  }
  return safe(() => {
    const payload = {
      participantId: participant.id,
      status: 'removed',
    };
    emit(EVENT_TYPES.PARTICIPANT_REMOVED, {
      contestId: participant.contestId,
      payload,
      delivery: {
        contestId: participant.contestId,
        ownerUserId: participant.userId,
        scopes: ['owner', 'admins'],
      },
    });
    emit(EVENT_TYPES.PARTICIPANT_STATUS_UPDATED, {
      contestId: participant.contestId,
      payload,
      delivery: {
        contestId: participant.contestId,
        ownerUserId: participant.userId,
        scopes: ['owner', 'admins'],
      },
    });
    return emit(EVENT_TYPES.CONTEST_SESSION_INVALIDATED, {
      contestId: participant.contestId,
      payload: { participantId: participant.id, reason: 'PARTICIPANT_REMOVED' },
      delivery: {
        contestId: participant.contestId,
        ownerUserId: participant.userId,
        scopes: ['owner'],
      },
    });
  });
}

function participantStatusUpdated(participant) {
  if (!participant) {
    return null;
  }
  return safe(() => emit(EVENT_TYPES.PARTICIPANT_STATUS_UPDATED, {
    contestId: participant.contestId,
    payload: {
      participantId: participant.id,
      status: participant.status,
      exitedAt: participant.exitedAt || null,
      readdedAt: participant.readdedAt || null,
      readdCount: participant.readdCount || 0,
    },
    delivery: {
      contestId: participant.contestId,
      ownerUserId: participant.userId,
      scopes: ['owner', 'admins'],
    },
  }));
}

function sessionInvalidated(participant, reason) {
  if (!participant) {
    return null;
  }
  return safe(() => {
    emit(EVENT_TYPES.PARTICIPANT_STATUS_UPDATED, {
      contestId: participant.contestId,
      payload: {
        participantId: participant.id,
        status: participant.status,
        exitedAt: participant.exitedAt || null,
        readdedAt: participant.readdedAt || null,
        readdCount: participant.readdCount || 0,
      },
      delivery: {
        contestId: participant.contestId,
        ownerUserId: participant.userId,
        scopes: ['owner', 'admins'],
      },
    });
    return emit(EVENT_TYPES.CONTEST_SESSION_INVALIDATED, {
      contestId: participant.contestId,
      payload: { participantId: participant.id, reason },
      delivery: {
        contestId: participant.contestId,
        ownerUserId: participant.userId,
        scopes: ['owner'],
      },
    });
  });
}

function violationDetected({ contestId, participant, questionId, tabSwitchCount, occurredAt }) {
  if (!participant) {
    return null;
  }
  return safe(() => emit(EVENT_TYPES.CONTEST_VIOLATION_DETECTED, {
    contestId,
    payload: {
      participantId: participant.id,
      questionId: questionId || null,
      type: 'TAB_SWITCH',
      tabSwitchCount,
      occurredAt,
    },
    delivery: { contestId, scopes: ['admins'] },
  }));
}

function resetForTests() {
  announcedStatus.clear();
  announcedEnding.clear();
}

module.exports = {
  submissionQueued,
  submissionEvaluating,
  submissionFinished,
  rankingUpdated,
  contestTransition,
  contestEnding,
  participantRemoved,
  participantScore,
  participantStatusUpdated,
  sessionInvalidated,
  violationDetected,
  resetForTests,
  ownerSummary,
  adminSummary,
};
