const AppError = require('../errors/AppError');
const contestRepository = require('../repositories/contest.repository');
const questionRepository = require('../repositories/question.repository');
const contestService = require('./contest.service');
const { withTransaction } = require('../db/transaction');
const { trimRequired } = require('../utils/input');

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

function assignmentOf(question) {
  if (question && question.isPractice) {
    return 'practice';
  }
  if (question && Array.isArray(question.contests) && question.contests.length > 0) {
    return 'contest';
  }
  if (question && question.contestId) {
    return 'contest';
  }
  return 'unassigned';
}

function toAdminQuestion(question) {
  const contests = Array.isArray(question.contests) ? question.contests : [];
  return {
    ...question,
    contests,
    contestCount: contests.length,
    assignment: assignmentOf({ ...question, contests }),
  };
}

function toStudentQuestion(question) {
  const {
    isDevelopmentSeed,
    isPractice,
    contestTitle,
    assignment,
    contests,
    contestCount,
    ...rest
  } = question;
  return rest;
}

function toPracticeProblem(question) {
  const { contestId, contestTitle, isDevelopmentSeed, isPractice, contests, contestCount, assignment, ...rest } = question;
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
  return raw.map((testCase, index) => parseOneTestCase(testCase, index));
}

function parseOneTestCase(testCase, index) {
  if (!testCase || typeof testCase !== 'object') {
    throw new AppError(`testCases[${index}] is invalid`, 400, { code: 'VALIDATION_ERROR' });
  }
  if (typeof testCase.expectedOutput !== 'string' || testCase.expectedOutput === '') {
    throw new AppError('expectedOutput is required', 400, { code: 'VALIDATION_ERROR' });
  }
  if (testCase.stdin !== undefined && typeof testCase.stdin !== 'string') {
    throw new AppError('stdin must be a string', 400, { code: 'VALIDATION_ERROR' });
  }
  return {
    stdin: typeof testCase.stdin === 'string' ? testCase.stdin : '',
    expectedOutput: testCase.expectedOutput,
    isHidden: Boolean(testCase.isHidden),
    sortOrder: index,
  };
}

async function createQuestion(contestId, body) {
  if (contestId) {
    await requireContest(contestId);
  }
  const title = trimRequired(body.title, 'title', 200);
  const difficulty = body.difficulty || 'easy';
  if (!DIFFICULTIES.has(difficulty)) {
    throw new AppError('difficulty is invalid', 400, { code: 'VALIDATION_ERROR' });
  }
  const testCases = parseTestCases(body.testCases);
  return withTransaction(async (client) => {
    const sortOrder = contestId
      ? await questionRepository.nextSortOrder(contestId, client)
      : await questionRepository.nextUnassignedSortOrder(client);
    const question = await questionRepository.create({
      contestId: contestId || null,
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

    if (contestId) {
      await questionRepository.assignToContest(question.id, contestId, sortOrder, client);
    }

    const createdCases = [];
    for (const testCase of testCases) {
      createdCases.push(await questionRepository.createTestCase({
        questionId: question.id,
        ...testCase,
      }, client));
    }

    const loaded = await questionRepository.findById(question.id, client);
    return toAdminQuestion({
      ...loaded,
      contestId: contestId || null,
      testCases: createdCases,
      ...sampleFromCases(createdCases),
    });
  });
}

function assertAttachable(question, contestId) {
  if (!question) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  if (question.isPractice) {
    throw new AppError('Practice questions cannot be attached to a contest.', 409, {
      code: 'PRACTICE_QUESTION',
    });
  }
  const already = question.contestId === contestId
    || (Array.isArray(question.contests) && question.contests.some((row) => row.id === contestId));
  if (already) {
    throw new AppError('Question already belongs to this contest', 409, {
      code: 'QUESTION_ALREADY_ATTACHED',
    });
  }
}

async function attachQuestion(contestId, questionId) {
  await requireContest(contestId);
  return withTransaction(async (client) => {
    const question = await questionRepository.lockById(questionId, client);
    assertAttachable(question, contestId);
    if (await questionRepository.isAttached(contestId, questionId, client)) {
      throw new AppError('Question already belongs to this contest', 409, {
        code: 'QUESTION_ALREADY_ATTACHED',
      });
    }
    const sortOrder = await questionRepository.nextSortOrder(contestId, client);
    const attached = await questionRepository.assignToContest(
      questionId,
      contestId,
      sortOrder,
      client,
    );
    return toAdminQuestion(await attachCases({ ...attached, contestId, sortOrder }, { includeHidden: true }));
  });
}

async function attachQuestions(contestId, questionIds) {
  await requireContest(contestId);
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    throw new AppError('questionIds must be a non-empty array', 400, { code: 'VALIDATION_ERROR' });
  }
  const unique = [...new Set(questionIds)];
  if (unique.length !== questionIds.length) {
    throw new AppError('questionIds must not contain duplicates', 400, { code: 'VALIDATION_ERROR' });
  }
  return withTransaction(async (client) => {
    const attached = [];
    for (const questionId of unique) {
      const question = await questionRepository.lockById(questionId, client);
      assertAttachable(question, contestId);
      if (await questionRepository.isAttached(contestId, questionId, client)) {
        throw new AppError('Question already belongs to this contest', 409, {
          code: 'QUESTION_ALREADY_ATTACHED',
        });
      }
      const sortOrder = await questionRepository.nextSortOrder(contestId, client);
      const row = await questionRepository.assignToContest(
        questionId,
        contestId,
        sortOrder,
        client,
      );
      attached.push(await attachCases({ ...row, contestId, sortOrder }, { includeHidden: true }));
    }
    return attached.map(toAdminQuestion);
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
    const withCases = await Promise.all(
      questions.map((question) => attachCases(question, { includeHidden: true })),
    );
    return withCases.map(toAdminQuestion);
  }
  const questions = await questionRepository.listAll();
  const withCases = await Promise.all(
    questions.map((question) => attachCases(question, { includeHidden: true })),
  );
  return withCases.map(toAdminQuestion);
}

async function getAdminQuestion(questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  return toAdminQuestion(await attachCases(question, { includeHidden: true }));
}

async function updateQuestion(questionId, body) {
  const existing = await questionRepository.findById(questionId);
  if (!existing) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const fields = {};
  if (body.title !== undefined) {
    fields.title = trimRequired(body.title, 'title', 200);
  }
  if (body.description !== undefined) {
    fields.description = typeof body.description === 'string' ? body.description : '';
  }
  if (body.inputFormat !== undefined) {
    fields.inputFormat = typeof body.inputFormat === 'string' ? body.inputFormat : '';
  }
  if (body.outputFormat !== undefined) {
    fields.outputFormat = typeof body.outputFormat === 'string' ? body.outputFormat : '';
  }
  if (body.constraints !== undefined) {
    fields.constraints = typeof body.constraints === 'string' ? body.constraints : '';
  }
  if (body.difficulty !== undefined) {
    if (!DIFFICULTIES.has(body.difficulty)) {
      throw new AppError('difficulty is invalid', 400, { code: 'VALIDATION_ERROR' });
    }
    fields.difficulty = body.difficulty;
  }
  if (body.timeLimitSeconds !== undefined) {
    if (!Number.isInteger(body.timeLimitSeconds) || body.timeLimitSeconds <= 0) {
      throw new AppError('timeLimitSeconds is invalid', 400, { code: 'VALIDATION_ERROR' });
    }
    fields.timeLimitSeconds = body.timeLimitSeconds;
  }
  if (body.memoryLimitMb !== undefined) {
    if (!Number.isInteger(body.memoryLimitMb) || body.memoryLimitMb <= 0) {
      throw new AppError('memoryLimitMb is invalid', 400, { code: 'VALIDATION_ERROR' });
    }
    fields.memoryLimitMb = body.memoryLimitMb;
  }
  const updated = await questionRepository.update(questionId, fields);
  return toAdminQuestion(await attachCases(updated, { includeHidden: true }));
}

async function listAdminTestCases(questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  return questionRepository.listTestCases(questionId);
}

async function createAdminTestCase(questionId, body) {
  const question = await questionRepository.findById(questionId);
  if (!question) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const parsed = parseOneTestCase(body || {}, 0);
  const sortOrder = await questionRepository.nextTestCaseSortOrder(questionId);
  return questionRepository.createTestCase({
    questionId,
    stdin: parsed.stdin,
    expectedOutput: parsed.expectedOutput,
    isHidden: parsed.isHidden,
    sortOrder,
  });
}

async function updateAdminTestCase(questionId, testCaseId, body) {
  const question = await questionRepository.findById(questionId);
  if (!question) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const existing = await questionRepository.findTestCaseById(testCaseId);
  if (!existing || existing.questionId !== questionId) {
    throw new AppError('Test case not found', 404, { code: 'NOT_FOUND' });
  }
  const fields = {};
  if (body.stdin !== undefined) {
    if (typeof body.stdin !== 'string') {
      throw new AppError('stdin must be a string', 400, { code: 'VALIDATION_ERROR' });
    }
    fields.stdin = body.stdin;
  }
  if (body.expectedOutput !== undefined) {
    if (typeof body.expectedOutput !== 'string' || body.expectedOutput === '') {
      throw new AppError('expectedOutput is required', 400, { code: 'VALIDATION_ERROR' });
    }
    fields.expectedOutput = body.expectedOutput;
  }
  if (body.isHidden !== undefined) {
    fields.isHidden = Boolean(body.isHidden);
  }
  const updated = await questionRepository.updateTestCase(testCaseId, questionId, fields);
  if (!updated) {
    throw new AppError('Test case not found', 404, { code: 'NOT_FOUND' });
  }
  return updated;
}

async function deleteAdminTestCase(questionId, testCaseId) {
  const question = await questionRepository.findById(questionId);
  if (!question) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const existing = await questionRepository.findTestCaseById(testCaseId);
  if (!existing || existing.questionId !== questionId) {
    throw new AppError('Test case not found', 404, { code: 'NOT_FOUND' });
  }
  const remaining = await questionRepository.countTestCases(questionId);
  if (remaining <= 1) {
    throw new AppError('A question must keep at least one test case', 409, {
      code: 'LAST_TEST_CASE',
    });
  }
  const deleted = await questionRepository.deleteTestCase(testCaseId, questionId);
  if (!deleted) {
    throw new AppError('Test case not found', 404, { code: 'NOT_FOUND' });
  }
  return { id: testCaseId };
}

async function reorderQuestions(contestId, questionIds) {
  await requireContest(contestId);
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    throw new AppError('questionIds must be a non-empty array', 400, { code: 'VALIDATION_ERROR' });
  }
  const existing = await questionRepository.listByContestId(contestId);
  const existingIds = existing.map((question) => question.id);
  if (questionIds.length !== existingIds.length) {
    throw new AppError('questionIds must include every contest question exactly once', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  const unique = new Set(questionIds);
  if (unique.size !== questionIds.length) {
    throw new AppError('questionIds must not contain duplicates', 400, { code: 'VALIDATION_ERROR' });
  }
  for (const id of questionIds) {
    if (!existingIds.includes(id)) {
      throw new AppError('questionIds must include every contest question exactly once', 400, {
        code: 'VALIDATION_ERROR',
      });
    }
  }
  return withTransaction(async (client) => {
    for (const [index, id] of questionIds.entries()) {
      await questionRepository.updateSortOrder(id, contestId, index, client);
    }
    const questions = await questionRepository.listByContestId(contestId, client);
    const withCases = await Promise.all(
      questions.map((question) => attachCases(question, { includeHidden: true })),
    );
    return withCases.map(toAdminQuestion);
  });
}

async function listStudentQuestions(user, contestId) {
  await contestService.assertArenaAccess(user, contestId);
  const questions = await questionRepository.listByContestId(contestId);
  const withCases = await Promise.all(
    questions.map((question) => attachCases(question, { includeHidden: false })),
  );
  return withCases.map(toStudentQuestion);
}

async function getStudentQuestion(user, contestId, questionId) {
  await contestService.assertArenaAccess(user, contestId);
  const question = await questionRepository.findById(questionId);
  const attached = question && await questionRepository.isAttached(contestId, questionId);
  if (!question || question.isPractice || !attached) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  return toStudentQuestion(await attachCases({ ...question, contestId }, { includeHidden: false }));
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
  assignmentOf,
  createQuestion,
  attachQuestion,
  attachQuestions,
  updateQuestion,
  listAdminTestCases,
  createAdminTestCase,
  updateAdminTestCase,
  deleteAdminTestCase,
  reorderQuestions,
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
