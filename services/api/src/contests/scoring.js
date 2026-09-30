/**
 * Authoritative contest scoring, penalty, and ranking helpers.
 *
 * Question total = SUM(test_case.points)
 * Contest total  = SUM(question totals of attached questions)
 * Participant possible score excludes invalidated questions.
 *
 * Penalty is not defined in MileStone-doc.md or README. The documented M10
 * rule is ICPC-inspired and adapted to partial per-test scoring:
 *
 *   origin = contest.startTime if set, else participant.startedAt
 *   For each non-invalidated question with earnedPoints > 0:
 *     scoringAt = earliest time the current earnedPoints was reached
 *     timeMinutes = floor((scoringAt - origin) / 60000)
 *     wrongAttempts = earlier contest submits with earned < current earned
 *                     (INTERNAL_ERROR does not count)
 *     questionPenalty = max(0, timeMinutes) + 20 * wrongAttempts
 *   Total penalty = sum of questionPenalty
 *
 * Ranking: score DESC, penalty ASC, lastScoringAt ASC, userId ASC.
 */

const DEFAULT_TEST_CASE_POINTS = 10;
const WRONG_ATTEMPT_PENALTY_MINUTES = 20;

function parsePoints(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_TEST_CASE_POINTS;
  }
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    const error = new Error('points must be a positive integer');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  return parsed;
}

function sumTestCasePoints(testCases) {
  if (!Array.isArray(testCases)) {
    return 0;
  }
  return testCases.reduce((sum, testCase) => {
    const points = Number(testCase && testCase.points);
    return sum + (Number.isInteger(points) && points > 0 ? points : 0);
  }, 0);
}

function participantPossibleScore(questions) {
  if (!Array.isArray(questions)) {
    return 0;
  }
  return questions.reduce((sum, question) => {
    if (question && question.invalidated) {
      return sum;
    }
    return sum + Number(question.totalPoints || 0);
  }, 0);
}

function participantEarnedScore(questions) {
  if (!Array.isArray(questions)) {
    return 0;
  }
  return questions.reduce((sum, question) => {
    if (question && question.invalidated) {
      return sum;
    }
    return sum + Number(question.earnedPoints || 0);
  }, 0);
}

function parseMs(value) {
  if (!value) {
    return null;
  }
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function penaltyOriginMs(contest, participant) {
  return parseMs(contest && contest.startTime) || parseMs(participant && participant.startedAt);
}

function calculateQuestionPenalty(question, originMs) {
  if (!question || question.invalidated || Number(question.earnedPoints || 0) <= 0) {
    return 0;
  }
  const target = Number(question.earnedPoints);
  const submissions = Array.isArray(question.submissions) ? question.submissions : [];
  const scored = submissions
    .filter((row) => row && row.kind === 'submit' && Number(row.score || 0) >= target)
    .sort((a, b) => (parseMs(a.evaluatedAt || a.createdAt) || 0) - (parseMs(b.evaluatedAt || b.createdAt) || 0));
  const scoringAt = scored.length > 0
    ? parseMs(scored[0].evaluatedAt || scored[0].createdAt)
    : null;
  const timeMinutes = originMs != null && scoringAt != null
    ? Math.max(0, Math.floor((scoringAt - originMs) / 60000))
    : 0;
  const wrongAttempts = submissions.filter((row) => {
    if (!row || row.kind !== 'submit') {
      return false;
    }
    if (row.status === 'INTERNAL_ERROR') {
      return false;
    }
    const at = parseMs(row.evaluatedAt || row.createdAt);
    if (scoringAt != null && at != null && at >= scoringAt) {
      return false;
    }
    return Number(row.score || 0) < target;
  }).length;
  return timeMinutes + WRONG_ATTEMPT_PENALTY_MINUTES * wrongAttempts;
}

function calculatePenalty({ contest, participant, questions }) {
  const originMs = penaltyOriginMs(contest, participant);
  if (!Array.isArray(questions)) {
    return 0;
  }
  return questions.reduce((sum, question) => sum + calculateQuestionPenalty(question, originMs), 0);
}

function lastScoringAt(questions) {
  if (!Array.isArray(questions)) {
    return null;
  }
  let latest = null;
  for (const question of questions) {
    if (!question || question.invalidated || Number(question.earnedPoints || 0) <= 0) {
      continue;
    }
    const submissions = Array.isArray(question.submissions) ? question.submissions : [];
    for (const row of submissions) {
      if (!row || row.kind !== 'submit') {
        continue;
      }
      const at = parseMs(row.evaluatedAt || row.createdAt);
      if (at != null && (latest == null || at > latest)) {
        latest = at;
      }
    }
  }
  return latest;
}

function compareRanking(a, b) {
  const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  const penaltyDelta = Number(a.penalty || 0) - Number(b.penalty || 0);
  if (penaltyDelta !== 0) {
    return penaltyDelta;
  }
  const aLast = parseMs(a.lastScoringAt);
  const bLast = parseMs(b.lastScoringAt);
  if (aLast != null && bLast != null && aLast !== bLast) {
    return aLast - bLast;
  }
  if (aLast == null && bLast != null) {
    return 1;
  }
  if (aLast != null && bLast == null) {
    return -1;
  }
  return String(a.userId || '').localeCompare(String(b.userId || ''));
}

function assignRanks(rows) {
  const sorted = [...rows].sort(compareRanking);
  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function computeEffectiveDeadline({ startedAt, durationMinutes, contestEndTime, contestResolvedEndMs }) {
  const startMs = parseMs(startedAt);
  const duration = Number(durationMinutes);
  if (startMs == null || !Number.isInteger(duration) || duration <= 0) {
    return contestEndTime || (contestResolvedEndMs != null ? new Date(contestResolvedEndMs).toISOString() : null);
  }
  let deadlineMs = startMs + duration * 60 * 1000;
  const explicitEnd = parseMs(contestEndTime);
  if (explicitEnd != null) {
    deadlineMs = Math.min(deadlineMs, explicitEnd);
  }
  if (contestResolvedEndMs != null) {
    deadlineMs = Math.min(deadlineMs, contestResolvedEndMs);
  }
  return new Date(deadlineMs).toISOString();
}

module.exports = {
  DEFAULT_TEST_CASE_POINTS,
  WRONG_ATTEMPT_PENALTY_MINUTES,
  parsePoints,
  sumTestCasePoints,
  participantPossibleScore,
  participantEarnedScore,
  calculatePenalty,
  calculateQuestionPenalty,
  lastScoringAt,
  compareRanking,
  assignRanks,
  computeEffectiveDeadline,
  penaltyOriginMs,
};
