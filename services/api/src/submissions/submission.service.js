const { publish, MESSAGE_TYPES, isMessagingReady } = require('../messaging');
const AppError = require('../errors/AppError');
const contestService = require('../contests/contest.service');
const sessionService = require('../contests/session.service');
const evaluationService = require('../contests/evaluation.service');
const rankingService = require('../contests/ranking.service');
const submissionRepository = require('../repositories/submission.repository');
const questionService = require('../contests/question.service');
const { getLanguageBySlug } = require('../config/languages');
const { assertUuid } = require('../utils/input');
const { withTransaction } = require('../db/transaction');
const { sumTestCasePoints } = require('../contests/scoring');

function selectTestCases(testCases, kind) {
  if (kind === 'run') {
    const visible = testCases.filter((testCase) => !testCase.isHidden);
    return visible.length > 0 ? [visible[0]] : testCases.slice(0, 1);
  }
  return testCases;
}

async function createAndEnqueue(user, body) {
  return enqueueExecution(user, body, { practice: false });
}

async function createPracticeAndEnqueue(user, body) {
  return enqueueExecution(user, body, { practice: true });
}

async function enqueueExecution(user, body, { practice }) {
  const kind = body.kind === 'run' ? 'run' : 'submit';
  if (typeof body.sourceCode !== 'string' || body.sourceCode.trim() === '') {
    throw new AppError('sourceCode is required', 400, { code: 'VALIDATION_ERROR' });
  }
  const language = getLanguageBySlug(body.language);
  if (!language) {
    throw new AppError('language is not supported', 400, { code: 'VALIDATION_ERROR' });
  }
  assertUuid(body.questionId, 'questionId');

  let question;
  let testCases;
  let contestId = null;
  let participantId = null;

  if (practice) {
    ({ question, testCases } = await questionService.getPracticeQuestionForExecution(body.questionId));
  } else {
    ({ question, testCases } = await questionService.getQuestionForExecution(body.questionId));
    if (!body.contestId) {
      throw new AppError('contestId is required', 400, { code: 'VALIDATION_ERROR' });
    }
    assertUuid(body.contestId, 'contestId');
    const access = await contestService.assertExecutionAccess(user, question, body.contestId);
    contestId = body.contestId;
    participantId = access && access.participant ? access.participant.id : null;
  }

  const selected = selectTestCases(testCases, kind);
  if (selected.length === 0) {
    throw new AppError('Question has no test cases', 409, { code: 'QUESTION_HAS_NO_TESTS' });
  }
  if (!isMessagingReady()) {
    throw new AppError('Execution queue is unavailable', 503, { code: 'RABBITMQ_NOT_CONNECTED' });
  }

  const submission = await submissionRepository.create({
    userId: user.id,
    contestId,
    participantId,
    questionId: question.id,
    languageSlug: language.slug,
    languageId: language.judge0Id,
    sourceCode: body.sourceCode,
    kind,
    testsTotal: selected.length,
  });

  console.log(
    `[API] Submission created submissionId=${submission.id} contestId=${contestId || 'practice'} participantId=${participantId || 'none'} questionId=${question.id} kind=${kind}`,
  );

  try {
    await publish({
      type: MESSAGE_TYPES.EXECUTION_REQUESTED,
      payload: {
        jobId: submission.id,
        contestId,
        participantId,
        questionId: question.id,
        kind,
        sourceCode: body.sourceCode,
        languageId: language.judge0Id,
        cpuTimeLimit: question.timeLimitSeconds,
        memoryLimit: question.memoryLimitMb * 1024,
        testCases: selected.map((testCase, index) => ({
          id: testCase.id,
          stdin: testCase.stdin,
          expectedOutput: testCase.expectedOutput,
          points: testCase.points,
          isHidden: Boolean(testCase.isHidden),
          sortOrder: Number.isInteger(testCase.sortOrder) ? testCase.sortOrder : index,
        })),
      },
    });
    console.log(`[API] Execution requested submissionId=${submission.id} questionId=${question.id}`);
    require('../realtime/notify').submissionQueued(submission);
  } catch (err) {
    if (err && (err.code === 'RABBITMQ_NOT_CONNECTED' || err.code === 'RABBITMQ_UNAVAILABLE')) {
      throw new AppError('Execution queue is unavailable', 503, { code: err.code });
    }
    throw err;
  }

  return submissionRepository.toPublic(submission);
}

async function withResults(submission, { includeHiddenResults = false } = {}) {
  const loaded = await submissionRepository.attachTestResults(submission);
  return submissionRepository.toPublic(loaded, { includeHiddenResults });
}

async function getOwnedSubmission(user, submissionId) {
  const submission = await submissionRepository.findById(submissionId);
  if (!submission || submission.userId !== user.id) {
    throw new AppError('Submission not found', 404, { code: 'NOT_FOUND' });
  }
  return withResults(submission);
}

async function listOwnedSubmissions(user) {
  const rows = await submissionRepository.listByUser(user.id);
  return Promise.all(rows.map((row) => withResults(row)));
}

async function listOwnedContestSubmissions(user, contestId) {
  assertUuid(contestId, 'contestId');
  await sessionService.getSession(user, contestId);
  const rows = await submissionRepository.listByContestAndUser(contestId, user.id);
  return Promise.all(rows.map((row) => withResults(row)));
}

async function listAdminContestSubmissions(contestId) {
  assertUuid(contestId, 'contestId');
  const rows = await submissionRepository.listByContest(contestId);
  const loaded = await Promise.all(rows.map((row) => submissionRepository.attachTestResults(row)));
  return loaded.map((row) => submissionRepository.toAdmin(row));
}

async function getOwnedPracticeSubmission(user, submissionId) {
  const submission = await submissionRepository.findById(submissionId);
  if (!submission || submission.userId !== user.id) {
    throw new AppError('Submission not found', 404, { code: 'NOT_FOUND' });
  }
  try {
    await questionService.getPracticeQuestionForExecution(submission.questionId);
  } catch (err) {
    if (err && err.statusCode === 404) {
      throw new AppError('Submission not found', 404, { code: 'NOT_FOUND' });
    }
    throw err;
  }
  return withResults(submission);
}

async function listOwnedPracticeSubmissions(user) {
  const rows = await submissionRepository.listByUserPractice(user.id);
  return Promise.all(rows.map((row) => withResults(row)));
}

function scoreFromResults(payload, submission) {
  if (Array.isArray(payload.testResults) && payload.testResults.length > 0) {
    return payload.testResults.reduce((sum, row) => sum + Number(row.pointsEarned || 0), 0);
  }
  if (payload.score !== undefined && payload.score !== null) {
    return Number(payload.score);
  }
  return Number(submission.score || 0);
}

async function applyExecutionResult(payload) {
  if (!payload || typeof payload.jobId !== 'string') {
    return null;
  }
  const existing = await submissionRepository.findById(payload.jobId);
  if (!existing) {
    console.log(`[API] Execution result ignored (unknown jobId=${payload.jobId})`);
    return null;
  }

  return withTransaction(async (client) => {
    const score = scoreFromResults(payload, existing);
    const updated = await submissionRepository.applyResult(payload.jobId, {
      ...payload,
      score,
    }, client);
    if (Array.isArray(payload.testResults)) {
      updated.testResults = await submissionRepository.replaceTestResults(
        updated.id,
        payload.testResults,
        client,
      );
    }
    console.log(
      `[API] Evaluation completed submissionId=${updated.id} status=${updated.status} score=${updated.score}`,
    );

    if (updated.contestId && updated.participantId && updated.kind === 'submit') {
      const contestRepository = require('../repositories/contest.repository');
      const participantRepository = require('../repositories/participant.repository');
      const contest = await contestRepository.findById(updated.contestId, client);
      const participant = await participantRepository.findById(updated.participantId, client);
      if (contest && participant) {
        await evaluationService.applyQuestionScore(
          contest,
          participant,
          updated.questionId,
          updated.score,
          client,
        );
        console.log(
          `[API] Score calculated contestId=${contest.id} participantId=${participant.id} questionId=${updated.questionId} submissionId=${updated.id}`,
        );
      }
    }
    return updated;
  }).then((updated) => {
    if (updated) {
      void require('../realtime/notify').submissionFinished(updated);
    }
    return updated;
  });
}

async function markEvaluating(payload) {
  if (!payload || typeof payload.jobId !== 'string') {
    return null;
  }
  const updated = await submissionRepository.markRunning(payload.jobId);
  if (!updated) {
    return null;
  }
  console.log(`[API] Submission evaluating submissionId=${updated.id}`);
  require('../realtime/notify').submissionEvaluating(updated);
  return updated;
}

async function getStudentRanking(user, contestId) {
  await sessionService.getSession(user, contestId);
  return rankingService.rankingForContest(contestId, { includeEmail: false });
}

async function getAdminRanking(contestId) {
  return rankingService.rankingForContest(contestId, { includeEmail: true });
}

module.exports = {
  createAndEnqueue,
  createPracticeAndEnqueue,
  getOwnedSubmission,
  listOwnedSubmissions,
  listOwnedContestSubmissions,
  listAdminContestSubmissions,
  getOwnedPracticeSubmission,
  listOwnedPracticeSubmissions,
  applyExecutionResult,
  markEvaluating,
  getStudentRanking,
  getAdminRanking,
  selectTestCases,
  sumTestCasePoints,
};
