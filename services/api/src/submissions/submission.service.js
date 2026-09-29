const { publish, MESSAGE_TYPES, isMessagingReady } = require('../messaging');
const AppError = require('../errors/AppError');
const contestRepository = require('../repositories/contest.repository');
const submissionRepository = require('../repositories/submission.repository');
const questionService = require('../contests/question.service');
const { getLanguageBySlug } = require('../config/languages');
const { assertUuid } = require('../utils/input');

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

  if (practice) {
    ({ question, testCases } = await questionService.getPracticeQuestionForExecution(body.questionId));
  } else {
    ({ question, testCases } = await questionService.getQuestionForExecution(body.questionId));
    const contest = await contestRepository.findById(question.contestId);
    if (!contest || contest.status !== 'running') {
      throw new AppError('Contest is not open for execution', 409, { code: 'CONTEST_NOT_RUNNING' });
    }
    if (body.contestId && body.contestId !== question.contestId) {
      throw new AppError('Question does not belong to this contest', 400, { code: 'VALIDATION_ERROR' });
    }
    contestId = question.contestId;
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
    questionId: question.id,
    languageSlug: language.slug,
    languageId: language.judge0Id,
    sourceCode: body.sourceCode,
    kind,
    testsTotal: selected.length,
  });

  try {
    await publish({
      type: MESSAGE_TYPES.EXECUTION_REQUESTED,
      payload: {
        jobId: submission.id,
        sourceCode: body.sourceCode,
        languageId: language.judge0Id,
        cpuTimeLimit: question.timeLimitSeconds,
        memoryLimit: question.memoryLimitMb * 1024,
        testCases: selected.map((testCase) => ({
          stdin: testCase.stdin,
          expectedOutput: testCase.expectedOutput,
        })),
      },
    });
  } catch (err) {
    if (err && (err.code === 'RABBITMQ_NOT_CONNECTED' || err.code === 'RABBITMQ_UNAVAILABLE')) {
      throw new AppError('Execution queue is unavailable', 503, { code: err.code });
    }
    throw err;
  }

  return submissionRepository.toPublic(submission);
}

async function getOwnedSubmission(user, submissionId) {
  const submission = await submissionRepository.findById(submissionId);
  if (!submission || submission.userId !== user.id) {
    throw new AppError('Submission not found', 404, { code: 'NOT_FOUND' });
  }
  return submissionRepository.toPublic(submission);
}

async function listOwnedSubmissions(user) {
  const rows = await submissionRepository.listByUser(user.id);
  return rows.map(submissionRepository.toPublic);
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
  return submissionRepository.toPublic(submission);
}

async function listOwnedPracticeSubmissions(user) {
  const rows = await submissionRepository.listByUserPractice(user.id);
  return rows.map(submissionRepository.toPublic);
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
  return submissionRepository.applyResult(payload.jobId, payload);
}

module.exports = {
  createAndEnqueue,
  createPracticeAndEnqueue,
  getOwnedSubmission,
  listOwnedSubmissions,
  getOwnedPracticeSubmission,
  listOwnedPracticeSubmissions,
  applyExecutionResult,
};
