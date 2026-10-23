const contestService = require('../contests/contest.service');
const questionService = require('../contests/question.service');
const sessionService = require('../contests/session.service');
const submissionService = require('../submissions/submission.service');
const { sendSuccess } = require('../utils/api-response');
const { assertUuid } = require('../utils/input');

function optionalContestId(value) {
  if (value === undefined || value === null || value === '' || value === 'unassigned') {
    return null;
  }
  return assertUuid(value, 'contestId');
}

async function listContests(_req, res) {
  const contests = await contestService.listAdminContests();
  return sendSuccess(res, { contests }, 200);
}

async function createContest(req, res) {
  const contest = await contestService.createContest(req.user, req.body || {});
  return sendSuccess(res, { contest }, 201);
}

async function getContest(req, res) {
  const contest = await contestService.getAdminContest(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { contest }, 200);
}

async function updateContest(req, res) {
  const contest = await contestService.updateContest(
    assertUuid(req.params.id, 'id'),
    req.body || {},
  );
  return sendSuccess(res, { contest }, 200);
}

async function scheduleContest(req, res) {
  const contest = await contestService.scheduleContest(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { contest }, 200);
}

async function cancelContest(req, res) {
  const contest = await contestService.cancelContest(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { contest }, 200);
}

async function endContest(req, res) {
  const contest = await contestService.endContest(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { contest }, 200);
}

async function resumeContest(req, res) {
  const contest = await contestService.resumeContest(
    assertUuid(req.params.id, 'id'),
    req.body || {},
  );
  return sendSuccess(res, { contest }, 200);
}

function hasLibraryFilter(query) {
  if (!query || typeof query !== 'object') {
    return false;
  }
  return ['q', 'difficulty', 'assignment', 'page', 'pageSize'].some((key) => {
    const value = query[key];
    return value !== undefined && value !== null && String(value) !== '';
  });
}

async function listQuestions(req, res) {
  const contestId = req.params.id
    ? assertUuid(req.params.id, 'id')
    : undefined;
  if (!contestId && hasLibraryFilter(req.query)) {
    const result = await questionService.searchAdminQuestions(req.query);
    return sendSuccess(res, result, 200);
  }
  const questions = await questionService.listAdminQuestions(contestId);
  return sendSuccess(res, { questions }, 200);
}

async function createQuestion(req, res) {
  const question = await questionService.createQuestion(
    assertUuid(req.params.id, 'id'),
    req.body || {},
  );
  return sendSuccess(res, { question }, 201);
}

async function createLibraryQuestion(req, res) {
  const body = req.body || {};
  const question = await questionService.createQuestion(
    optionalContestId(body.contestId),
    body,
  );
  return sendSuccess(res, { question }, 201);
}

async function attachQuestion(req, res) {
  const question = await questionService.attachQuestion(
    assertUuid(req.params.id, 'id'),
    assertUuid(req.params.questionId, 'questionId'),
  );
  return sendSuccess(res, { question }, 200);
}

async function attachQuestions(req, res) {
  const questions = await questionService.attachQuestions(
    assertUuid(req.params.id, 'id'),
    (req.body || {}).questionIds,
  );
  return sendSuccess(res, { questions }, 200);
}

async function updateQuestion(req, res) {
  const question = await questionService.updateQuestion(
    assertUuid(req.params.questionId, 'questionId'),
    req.body || {},
  );
  return sendSuccess(res, { question }, 200);
}

async function listTestCases(req, res) {
  const testCases = await questionService.listAdminTestCases(
    assertUuid(req.params.questionId, 'questionId'),
  );
  return sendSuccess(res, { testCases }, 200);
}

async function createTestCase(req, res) {
  const testCase = await questionService.createAdminTestCase(
    assertUuid(req.params.questionId, 'questionId'),
    req.body || {},
  );
  return sendSuccess(res, { testCase }, 201);
}

async function updateTestCase(req, res) {
  const testCase = await questionService.updateAdminTestCase(
    assertUuid(req.params.questionId, 'questionId'),
    assertUuid(req.params.testCaseId, 'testCaseId'),
    req.body || {},
  );
  return sendSuccess(res, { testCase }, 200);
}

async function deleteTestCase(req, res) {
  const testCase = await questionService.deleteAdminTestCase(
    assertUuid(req.params.questionId, 'questionId'),
    assertUuid(req.params.testCaseId, 'testCaseId'),
  );
  return sendSuccess(res, { testCase }, 200);
}

async function reorderQuestions(req, res) {
  const questions = await questionService.reorderQuestions(
    assertUuid(req.params.id, 'id'),
    (req.body || {}).questionIds,
  );
  return sendSuccess(res, { questions }, 200);
}

async function getQuestion(req, res) {
  const question = await questionService.getAdminQuestion(assertUuid(req.params.questionId, 'questionId'));
  return sendSuccess(res, { question }, 200);
}

async function updatePlacement(req, res) {
  const result = await questionService.updatePlacement(
    assertUuid(req.params.questionId, 'questionId'),
    req.body || {},
  );
  return sendSuccess(res, result, 200);
}

async function bulkManageQuestions(req, res) {
  const result = await questionService.bulkManage(req.body || {});
  return sendSuccess(res, result, 200);
}

async function detachQuestion(req, res) {
  const question = await questionService.detachQuestion(
    assertUuid(req.params.id, 'id'),
    assertUuid(req.params.questionId, 'questionId'),
  );
  return sendSuccess(res, { question }, 200);
}

async function deleteQuestion(req, res) {
  const question = await questionService.deleteQuestion(
    assertUuid(req.params.questionId, 'questionId'),
  );
  return sendSuccess(res, { question }, 200);
}

async function archiveQuestion(req, res) {
  const result = await questionService.archiveQuestion(
    assertUuid(req.params.questionId, 'questionId'),
  );
  return sendSuccess(res, result, 200);
}

async function listParticipants(req, res) {
  const participants = await contestService.listAdminParticipants(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { participants }, 200);
}

async function removeParticipant(req, res) {
  const participant = await sessionService.removeParticipant(
    assertUuid(req.params.id, 'id'),
    assertUuid(req.params.participantId, 'participantId'),
  );
  return sendSuccess(res, { participant }, 200);
}

async function readdParticipant(req, res) {
  const participant = await sessionService.readdParticipant(
    assertUuid(req.params.id, 'id'),
    assertUuid(req.params.participantId, 'participantId'),
  );
  return sendSuccess(res, { participant }, 200);
}

async function ranking(req, res) {
  const rankingRows = await submissionService.getAdminRanking(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { ranking: rankingRows }, 200);
}

async function listSubmissions(req, res) {
  const submissions = await submissionService.listAdminContestSubmissions(
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { submissions }, 200);
}

async function listViolations(req, res) {
  const violations = await sessionService.listViolations(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { violations }, 200);
}

module.exports = {
  listContests,
  createContest,
  getContest,
  updateContest,
  scheduleContest,
  cancelContest,
  endContest,
  resumeContest,
  listQuestions,
  createQuestion,
  createLibraryQuestion,
  attachQuestion,
  attachQuestions,
  updateQuestion,
  listTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  reorderQuestions,
  getQuestion,
  updatePlacement,
  bulkManageQuestions,
  detachQuestion,
  deleteQuestion,
  archiveQuestion,
  listParticipants,
  removeParticipant,
  readdParticipant,
  ranking,
  listSubmissions,
  listViolations,
};
