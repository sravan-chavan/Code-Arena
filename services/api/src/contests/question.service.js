const AppError = require('../errors/AppError');
const contestRepository = require('../repositories/contest.repository');
const questionRepository = require('../repositories/question.repository');
const contestService = require('./contest.service');
const { LANGUAGES } = require('../config/languages');
const { withTransaction } = require('../db/transaction');
const { assertUuid, trimRequired } = require('../utils/input');
const { parsePoints, sumTestCasePoints } = require('./scoring');

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const ASSIGNMENTS = new Set(['all', 'unassigned', 'practice', 'contest', 'both', 'archived']);
const BULK_ACTIONS = new Set(['add-practice', 'remove-practice', 'assign-contests', 'unassign-contests']);
const LANGUAGE_SUMMARY = LANGUAGES.map((language) => ({
  slug: language.slug,
  label: language.label,
}));

function hasContestAssignment(question) {
  if (!question) {
    return false;
  }
  if (Array.isArray(question.contests) && question.contests.length > 0) {
    return true;
  }
  return Boolean(question.contestId);
}

function assignmentOf(question) {
  if (question && question.archived) {
    return 'archived';
  }
  const inPractice = Boolean(question && question.isPractice);
  const inContest = hasContestAssignment(question);
  if (inPractice && inContest) {
    return 'both';
  }
  if (inPractice) {
    return 'practice';
  }
  if (inContest) {
    return 'contest';
  }
  return 'unassigned';
}

function toAdminQuestion(question) {
  const contests = Array.isArray(question.contests) ? question.contests : [];
  const testCases = Array.isArray(question.testCases) ? question.testCases : [];
  return {
    ...question,
    contests,
    contestCount: contests.length,
    languages: LANGUAGE_SUMMARY,
    assignment: assignmentOf({ ...question, contests }),
    totalPoints: question.totalPoints !== undefined
      ? Number(question.totalPoints)
      : sumTestCasePoints(testCases),
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
    archived,
    archivedAt,
    languages,
    ...rest
  } = question;
  return rest;
}

function toPracticeProblem(question) {
  const {
    contestId,
    contestTitle,
    isDevelopmentSeed,
    isPractice,
    contests,
    contestCount,
    assignment,
    archived,
    archivedAt,
    languages,
    ...rest
  } = question;
  return rest;
}

function publicTestCase(testCase) {
  return {
    id: testCase.id,
    stdin: testCase.stdin,
    expectedOutput: testCase.expectedOutput,
    isHidden: false,
    points: testCase.points,
    sortOrder: testCase.sortOrder,
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
  let points;
  try {
    points = parsePoints(testCase.points);
  } catch (err) {
    throw new AppError(err.message, 400, { code: 'VALIDATION_ERROR' });
  }
  return {
    stdin: typeof testCase.stdin === 'string' ? testCase.stdin : '',
    expectedOutput: testCase.expectedOutput,
    isHidden: Boolean(testCase.isHidden),
    sortOrder: Number.isInteger(testCase.sortOrder) ? testCase.sortOrder : index,
    points,
  };
}

function collectContestIds(contestId, body) {
  const ids = [];
  if (contestId) {
    ids.push(contestId);
  }
  if (body && body.contestIds !== undefined) {
    if (!Array.isArray(body.contestIds)) {
      throw new AppError('contestIds must be an array', 400, { code: 'VALIDATION_ERROR' });
    }
    for (const id of body.contestIds) {
      ids.push(assertUuid(id, 'contestIds'));
    }
  }
  return [...new Set(ids)];
}

function parseIncludeInPractice(body) {
  if (!body || body.includeInPractice === undefined) {
    return false;
  }
  if (typeof body.includeInPractice !== 'boolean') {
    throw new AppError('includeInPractice must be a boolean', 400, { code: 'VALIDATION_ERROR' });
  }
  return body.includeInPractice;
}

async function createQuestion(contestId, body) {
  const contestIds = collectContestIds(contestId, body);
  for (const id of contestIds) {
    await requireContest(id);
  }
  const includeInPractice = parseIncludeInPractice(body);
  const title = trimRequired(body.title, 'title', 200);
  const difficulty = body.difficulty || 'easy';
  if (!DIFFICULTIES.has(difficulty)) {
    throw new AppError('difficulty is invalid', 400, { code: 'VALIDATION_ERROR' });
  }
  const testCases = parseTestCases(body.testCases);
  return withTransaction(async (client) => {
    const sortOrder = contestIds.length === 1
      ? await questionRepository.nextSortOrder(contestIds[0], client)
      : await questionRepository.nextUnassignedSortOrder(client);
    const question = await questionRepository.create({
      contestId: contestIds[0] || null,
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

    if (includeInPractice) {
      await questionRepository.setPractice(question.id, true, client);
    }

    for (const id of contestIds) {
      const order = id === contestIds[0] && contestIds.length === 1
        ? sortOrder
        : await questionRepository.nextSortOrder(id, client);
      const inserted = await questionRepository.attachIfAbsent(question.id, id, order, client);
      if (!inserted) {
        throw new AppError('Question already belongs to this contest', 409, {
          code: 'QUESTION_ALREADY_ATTACHED',
        });
      }
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
      contestId: contestIds[0] || null,
      testCases: createdCases,
      ...sampleFromCases(createdCases),
    });
  });
}

function assertAttachable(question, contestId) {
  if (!question) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  if (question.archived) {
    throw new AppError('Archived questions cannot be assigned to a contest.', 409, {
      code: 'QUESTION_ARCHIVED',
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
    if (!attached) {
      throw new AppError('Question already belongs to this contest', 409, {
        code: 'QUESTION_ALREADY_ATTACHED',
      });
    }
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
      if (!row) {
        throw new AppError('Question already belongs to this contest', 409, {
          code: 'QUESTION_ALREADY_ATTACHED',
        });
      }
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
    totalPoints: sumTestCasePoints(testCases),
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
    points: parsed.points,
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
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder) || body.sortOrder < 0) {
      throw new AppError('sortOrder must be a non-negative integer', 400, {
        code: 'VALIDATION_ERROR',
      });
    }
    fields.sortOrder = body.sortOrder;
  }
  if (body.points !== undefined) {
    try {
      fields.points = parsePoints(body.points);
    } catch (err) {
      throw new AppError(err.message, 400, { code: 'VALIDATION_ERROR' });
    }
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
  const participantRepository = require('../repositories/participant.repository');
  const questionStateRepository = require('../repositories/question-state.repository');
  const participant = await participantRepository.findByContestAndUser(contestId, user.id);
  const states = participant
    ? await questionStateRepository.listByParticipant(contestId, participant.id)
    : [];
  const byQuestion = new Map(states.map((row) => [row.questionId, row]));
  return withCases.map((question) => {
    const state = byQuestion.get(question.id);
    return {
      ...toStudentQuestion(question),
      invalidated: Boolean(state && state.invalidated),
      earnedPoints: state && state.invalidated ? 0 : Number(state && state.earnedPoints || 0),
    };
  });
}

async function getStudentQuestion(user, contestId, questionId) {
  await contestService.assertArenaAccess(user, contestId);
  const question = await questionRepository.findById(questionId);
  const attached = question && await questionRepository.isAttached(contestId, questionId);
  if (!question || !attached) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const mapped = toStudentQuestion(await attachCases({ ...question, contestId }, { includeHidden: false }));
  const participantRepository = require('../repositories/participant.repository');
  const questionStateRepository = require('../repositories/question-state.repository');
  const participant = await participantRepository.findByContestAndUser(contestId, user.id);
  const state = participant
    ? await questionStateRepository.find(contestId, participant.id, questionId)
    : null;
  return {
    ...mapped,
    invalidated: Boolean(state && state.invalidated),
    earnedPoints: state && state.invalidated ? 0 : Number(state && state.earnedPoints || 0),
  };
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
  if (!question || !question.isPractice || question.archived) {
    throw new AppError('Practice problem not found', 404, { code: 'NOT_FOUND' });
  }
  return toPracticeProblem(await attachCases(question, { includeHidden: false }));
}

async function getQuestionForExecution(questionId) {
  const question = await questionRepository.findById(questionId);
  // Practice-only rows are not contest questions. A question that is also
  // assigned to a contest stays executable through the contest path.
  if (!question || (question.isPractice && !hasContestAssignment(question))) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  const testCases = await questionRepository.listTestCases(questionId);
  return { question, testCases };
}

async function getPracticeQuestionForExecution(questionId) {
  const question = await questionRepository.findById(questionId);
  if (!question || !question.isPractice || question.archived) {
    throw new AppError('Practice problem not found', 404, { code: 'NOT_FOUND' });
  }
  const testCases = await questionRepository.listTestCases(questionId);
  return { question, testCases };
}

function parseUuidList(value, field, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (!required) {
      return [];
    }
    throw new AppError(`${field} must be a non-empty array`, 400, { code: 'VALIDATION_ERROR' });
  }
  if (!Array.isArray(value)) {
    throw new AppError(`${field} must be an array`, 400, { code: 'VALIDATION_ERROR' });
  }
  if (required && value.length === 0) {
    throw new AppError(`${field} must be a non-empty array`, 400, { code: 'VALIDATION_ERROR' });
  }
  if (value.length > 100) {
    throw new AppError(`${field} is too large`, 400, { code: 'VALIDATION_ERROR' });
  }
  const ids = value.map((item) => assertUuid(item, field));
  if (new Set(ids).size !== ids.length) {
    throw new AppError(`${field} must not contain duplicates`, 400, { code: 'VALIDATION_ERROR' });
  }
  return ids;
}

function parseLibraryQuery(query) {
  const source = query || {};
  const q = typeof source.q === 'string' ? source.q.trim().slice(0, 200) : '';
  let difficulty = '';
  if (source.difficulty !== undefined && source.difficulty !== '' && source.difficulty !== 'all') {
    if (!DIFFICULTIES.has(source.difficulty)) {
      throw new AppError('difficulty is invalid', 400, { code: 'VALIDATION_ERROR' });
    }
    difficulty = source.difficulty;
  }
  const assignment = source.assignment === undefined || source.assignment === ''
    ? 'all'
    : source.assignment;
  if (!ASSIGNMENTS.has(assignment)) {
    throw new AppError('assignment is invalid', 400, { code: 'VALIDATION_ERROR' });
  }
  let page;
  let pageSize;
  if (source.page !== undefined && source.page !== '') {
    page = Number(source.page);
    if (!Number.isInteger(page) || page < 1) {
      throw new AppError('page must be a positive integer', 400, { code: 'VALIDATION_ERROR' });
    }
    pageSize = source.pageSize === undefined || source.pageSize === '' ? 25 : Number(source.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new AppError('pageSize must be an integer from 1 to 100', 400, { code: 'VALIDATION_ERROR' });
    }
  }
  return { q, difficulty, assignment, page, pageSize };
}

async function presentAdmin(questionId, client) {
  const loaded = await questionRepository.findById(questionId, client);
  if (!loaded) {
    throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
  }
  return toAdminQuestion(await attachCases(loaded, { includeHidden: true }));
}

function historyBlocksRemoval(history) {
  return Boolean(history && (history.submissions > 0 || history.states > 0));
}

async function assertContestsExist(contestIds) {
  for (const contestId of contestIds) {
    await requireContest(contestId);
  }
}

async function searchAdminQuestions(query) {
  const parsed = parseLibraryQuery(query);
  const found = await questionRepository.searchLibrary({
    q: parsed.q,
    difficulty: parsed.difficulty,
    assignment: parsed.assignment,
    limit: parsed.page ? parsed.pageSize : undefined,
    offset: parsed.page ? (parsed.page - 1) * parsed.pageSize : undefined,
  });
  const withCases = await Promise.all(
    found.questions.map((question) => attachCases(question, { includeHidden: true })),
  );
  const payload = { questions: withCases.map(toAdminQuestion) };
  if (parsed.page) {
    payload.pagination = {
      page: parsed.page,
      pageSize: parsed.pageSize,
      total: found.total,
      pageCount: Math.max(1, Math.ceil(found.total / parsed.pageSize)),
    };
  }
  return payload;
}

async function updatePlacement(questionId, body) {
  const source = body || {};
  const includeInPractice = source.includeInPractice;
  if (includeInPractice !== undefined && typeof includeInPractice !== 'boolean') {
    throw new AppError('includeInPractice must be a boolean', 400, { code: 'VALIDATION_ERROR' });
  }
  const addContestIds = parseUuidList(source.addContestIds, 'addContestIds', { required: false });
  const removeContestIds = parseUuidList(source.removeContestIds, 'removeContestIds', { required: false });
  if (includeInPractice === undefined && addContestIds.length === 0 && removeContestIds.length === 0) {
    throw new AppError('No placement changes were provided', 400, { code: 'VALIDATION_ERROR' });
  }
  const overlap = addContestIds.filter((id) => removeContestIds.includes(id));
  if (overlap.length > 0) {
    throw new AppError('A contest cannot be added and removed in the same request', 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  await assertContestsExist([...addContestIds, ...removeContestIds]);
  return withTransaction(async (client) => {
    const question = await questionRepository.lockById(questionId, client);
    if (!question) {
      throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
    }
    if (question.archived) {
      throw new AppError('Archived questions cannot change placement.', 409, {
        code: 'QUESTION_ARCHIVED',
      });
    }
    const blocked = [];
    for (const contestId of removeContestIds) {
      const history = await questionRepository.countContestHistory(questionId, contestId, client);
      if (historyBlocksRemoval(history)) {
        blocked.push({
          questionId,
          contestId,
          message: 'This contest already has submissions for the question.',
        });
      }
    }
    if (blocked.length > 0) {
      throw new AppError(
        'This question cannot be removed from a contest that already has submissions. Nothing was changed.',
        409,
        { code: 'CONTEST_QUESTION_HAS_HISTORY', errors: blocked },
      );
    }
    if (includeInPractice !== undefined) {
      await questionRepository.setPractice(questionId, includeInPractice, client);
    }
    for (const contestId of removeContestIds) {
      await questionRepository.detachFromContest(contestId, questionId, client);
    }
    const alreadyAssigned = [];
    for (const contestId of addContestIds) {
      const sortOrder = await questionRepository.nextSortOrder(contestId, client);
      const inserted = await questionRepository.attachIfAbsent(questionId, contestId, sortOrder, client);
      if (!inserted) {
        alreadyAssigned.push({ questionId, contestId });
      }
    }
    return {
      question: await presentAdmin(questionId, client),
      summary: { alreadyAssigned },
    };
  });
}

async function bulkManage(body) {
  const source = body || {};
  if (!BULK_ACTIONS.has(source.action)) {
    throw new AppError('action is invalid', 400, { code: 'VALIDATION_ERROR' });
  }
  const questionIds = parseUuidList(source.questionIds, 'questionIds');
  const needsContests = source.action === 'assign-contests' || source.action === 'unassign-contests';
  const contestIds = needsContests
    ? parseUuidList(source.contestIds, 'contestIds')
    : [];
  if (needsContests) {
    await assertContestsExist(contestIds);
  }
  return withTransaction(async (client) => {
    const locked = [];
    for (const questionId of questionIds) {
      const question = await questionRepository.lockById(questionId, client);
      if (!question) {
        throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
      }
      if (question.archived) {
        throw new AppError('Archived questions cannot change placement.', 409, {
          code: 'QUESTION_ARCHIVED',
          errors: [{ questionId, message: 'Question is archived.' }],
        });
      }
      locked.push(question);
    }

    if (source.action === 'unassign-contests') {
      const blocked = [];
      for (const questionId of questionIds) {
        for (const contestId of contestIds) {
          const history = await questionRepository.countContestHistory(questionId, contestId, client);
          if (historyBlocksRemoval(history)) {
            blocked.push({
              questionId,
              contestId,
              message: 'This contest already has submissions for the question.',
            });
          }
        }
      }
      if (blocked.length > 0) {
        throw new AppError(
          'Some questions cannot be removed because those contests already have submissions. Nothing was changed.',
          409,
          { code: 'CONTEST_QUESTION_HAS_HISTORY', errors: blocked },
        );
      }
    }

    const alreadyAssigned = [];
    for (const question of locked) {
      if (source.action === 'add-practice') {
        await questionRepository.setPractice(question.id, true, client);
      } else if (source.action === 'remove-practice') {
        await questionRepository.setPractice(question.id, false, client);
      } else if (source.action === 'assign-contests') {
        for (const contestId of contestIds) {
          const sortOrder = await questionRepository.nextSortOrder(contestId, client);
          const inserted = await questionRepository.attachIfAbsent(
            question.id,
            contestId,
            sortOrder,
            client,
          );
          if (!inserted) {
            alreadyAssigned.push({ questionId: question.id, contestId });
          }
        }
      } else if (source.action === 'unassign-contests') {
        for (const contestId of contestIds) {
          await questionRepository.detachFromContest(contestId, question.id, client);
        }
      }
    }

    const questions = [];
    for (const questionId of questionIds) {
      questions.push(await presentAdmin(questionId, client));
    }
    return {
      questions,
      summary: {
        updated: questionIds.length,
        alreadyAssigned,
      },
    };
  });
}

async function detachQuestion(contestId, questionId) {
  await requireContest(contestId);
  return withTransaction(async (client) => {
    const question = await questionRepository.lockById(questionId, client);
    if (!question) {
      throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
    }
    const history = await questionRepository.countContestHistory(questionId, contestId, client);
    if (historyBlocksRemoval(history)) {
      throw new AppError(
        'This question cannot be removed from the contest because submissions already exist. The question and its scores were left unchanged.',
        409,
        {
          code: 'CONTEST_QUESTION_HAS_HISTORY',
          errors: [{ questionId, contestId, message: 'Submissions exist for this contest assignment.' }],
        },
      );
    }
    const removed = await questionRepository.detachFromContest(contestId, questionId, client);
    if (!removed) {
      throw new AppError('Question is not assigned to this contest', 404, { code: 'NOT_FOUND' });
    }
    return presentAdmin(questionId, client);
  });
}

function questionHasHistory(history) {
  return Boolean(
    history
    && (history.submissions > 0 || history.states > 0 || history.violations > 0),
  );
}

async function deleteQuestion(questionId) {
  return withTransaction(async (client) => {
    const question = await questionRepository.lockById(questionId, client);
    if (!question) {
      throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
    }
    const history = await questionRepository.countQuestionHistory(questionId, client);
    if (questionHasHistory(history)) {
      throw new AppError(
        'This question has submissions or other contest history, so it cannot be permanently deleted. Archive it instead. Archiving removes it from Practice Arena and keeps historical submissions.',
        409,
        { code: 'QUESTION_HAS_HISTORY' },
      );
    }
    await questionRepository.deleteById(questionId, client);
    return { id: questionId, deleted: true };
  });
}

async function archiveQuestion(questionId) {
  return withTransaction(async (client) => {
    const question = await questionRepository.lockById(questionId, client);
    if (!question) {
      throw new AppError('Question not found', 404, { code: 'NOT_FOUND' });
    }
    const contestIds = await questionRepository.listMembershipContestIds(questionId, client);
    const retainedContestIds = [];
    const removedContestIds = [];
    for (const contestId of contestIds) {
      const history = await questionRepository.countContestHistory(questionId, contestId, client);
      if (historyBlocksRemoval(history)) {
        retainedContestIds.push(contestId);
      } else {
        await questionRepository.detachFromContest(contestId, questionId, client);
        removedContestIds.push(contestId);
      }
    }
    await questionRepository.archive(questionId, client);
    return {
      question: await presentAdmin(questionId, client),
      retainedContestIds,
      removedContestIds,
    };
  });
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
  searchAdminQuestions,
  updatePlacement,
  bulkManage,
  detachQuestion,
  deleteQuestion,
  archiveQuestion,
};
