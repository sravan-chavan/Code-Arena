const AppError = require('../errors/AppError');
const contestRepository = require('../repositories/contest.repository');
const questionRepository = require('../repositories/question.repository');
const { withTransaction } = require('../db/transaction');
const { trimRequired } = require('../utils/input');

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

function toStudentQuestion(question) {
  const { isDevelopmentSeed, isPractice, contestTitle, ...rest } = question;
  return rest;
}

function toPracticeProblem(question) {
  const { contestId, contestTitle, isDevelopmentSeed, isPractice, ...rest } = question;
  return rest;
}

function publicTestCase(testCase) {
  return {
    id: testCase.id,
    stdin: testCase.stdin,
    expectedOutput: testCase.expectedOutput,
    isHidden: false,
  };
}

function sampleFromCases(testCases) {
  const visible = testCases.filter((testCase) => !testCase.isHidden);
  const sample = visible[0] || testCases[0] || { stdin: '', expectedOutput: '' };
  return {
    sampleInput: sample.stdin || '',
    sampleOutput: sample.expectedOutput || '',
  };
}

async function requireContest(contestId) {
  const contest = await contestRepository.findById(contestId);
  if (!contest) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  return contest;
}

function parseTestCases(raw) {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new AppError('testCases must be a non-empty array', 400, { code: 'VALIDATION_ERROR' });
  }
  return raw.map((testCase, index) => {
    if (!testCase || typeof testCase !== 'object') {
      throw new AppError(`testCases[${index}] is invalid`, 400, { code: 'VALIDATION_ERROR' });
    }
    return {
      stdin: typeof testCase.stdin === 'string' ? testCase.stdin : '',
      expectedOutput: typeof testCase.expectedOutput === 'string' ? testCase.expectedOutput : '',
      isHidden: Boolean(testCase.isHidden),
      sortOrder: index,
    };
  });
}

async function createQuestion(contestId, body) {
  await requireContest(contestId);
  const title = trimRequired(body.title, 'title', 200);
  const difficulty = body.difficulty || 'easy';
  if (!DIFFICULTIES.has(difficulty)) {
    throw new AppError('difficulty is invalid', 400, { code: 'VALIDATION_ERROR' });
  }
  const testCases = parseTestCases(body.testCases);
  return withTransaction(async (client) => {
    const sortOrder = await questionRepository.nextSortOrder(contestId, client);
    const question = await questionRepository.create({
      contestId,
      title,
      description: typeof body.description === 'string' ? body.description : '',
      inputFormat: typeof body.inputFormat === 'string' ? body.inputFormat : '',
      outputFormat: typeof body.outputFormat === 'string' ? body.outputFormat : '',
      constraints: typeof body.constraints === 'string' ? body.constraints : '',
      difficulty,
      timeLimitSeconds: Number.isInteger(body.timeLimitSeconds) && body.timeLimitSeconds > 0
        ? body.timeLimitSeconds
        : 2,
      memoryLimitMb: Number.isInteger(body.memoryLimitMb) && body.memoryLimitMb > 0
        ? body.memoryLimitMb
        : 128,
      sortOrder,
    }, client);

    const createdCases = [];
    for (const testCase of testCases) {
      createdCases.push(await questionRepository.createTestCase({
        questionId: question.id,
        ...testCase,
      }, client));
    }

    return { ...question, testCases: createdCases, ...sampleFromCases(createdCases) };
  });
}

async function attachCases(question, { includeHidden }) {
  const testCases = await questionRepository.listTestCases(question.id);
  const sample = sampleFromCases(testCases);
  return {
    ...question,
    ...sample,
    testCases: includeHidden
      ? testCases
      : testCases.filter((testCase) => !testCase.isHidden).map(publicTestCase),
  };
}

async function listAdminQuestions(contestId) {
  if (contestId) {
    await requireContest(contestId);
    const questions = await questionRepository.listByContestId(contestId);
    return Promise.all(questions.map((question) => attachCases(question, { includeHidden: true })));
  }
  const questions = await questionRepository.listAll();
  return Promise.all(questions.map((question) => attachCases(question, { includeHidden: true })));
}

async function getAdminQuestion(questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  return attachCases(question, { includeHidden: true });
}

async function listStudentQuestions(contestId) {
  const contest = await requireContest(contestId);
  if (contest.status === 'draft') {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  const questions = await questionRepository.listByContestId(contestId);
  const withCases = await Promise.all(
    questions.map((question) => attachCases(question, { includeHidden: false })),
  );
  return withCases.map(toStudentQuestion);
}

async function getStudentQuestion(contestId, questionId) {
  const contest = await requireContest(contestId);
  if (contest.status === 'draft') {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  const question = await questionRepository.findById(questionId);
  if (!question || question.contestId !== contestId || question.isPractice) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  return toStudentQuestion(await attachCases(question, { includeHidden: false }));
}

async function listPracticeProblems() {
  const questions = await questionRepository.listPractice();
  const withCases = await Promise.all(
    questions.map((question) => attachCases(question, { includeHidden: false })),
  );
  return withCases.map(toPracticeProblem);
}

async function getPracticeProblem(questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question || !question.isPractice) {
    throw new AppError('Practice problem not found', 404, { code: 'NOT_FOUND' });
  }
  return toPracticeProblem(await attachCases(question, { includeHidden: false }));
}

async function getQuestionForExecution(questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question || question.isPractice) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const testCases = await questionRepository.listTestCases(questionId);
  return { question, testCases };
}

async function getPracticeQuestionForExecution(questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question || !question.isPractice) {
    throw new AppError('Practice problem not found', 404, { code: 'NOT_FOUND' });
  }
  const testCases = await questionRepository.listTestCases(questionId);
  return { question, testCases };
}

module.exports = {
  createQuestion,
  listAdminQuestions,
  getAdminQuestion,
  listStudentQuestions,
  getStudentQuestion,
  listPracticeProblems,
  getPracticeProblem,
  getQuestionForExecution,
  getPracticeQuestionForExecution,
  toPracticeProblem,
};
