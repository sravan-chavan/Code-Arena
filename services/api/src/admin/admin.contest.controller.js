const contestService = require('../contests/contest.service');
const questionService = require('../contests/question.service');
const { sendSuccess } = require('../utils/api-response');
const { assertUuid } = require('../utils/input');

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

async function listQuestions(req, res) {
  const contestId = req.params.id
    ? assertUuid(req.params.id, 'id')
    : undefined;
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

async function getQuestion(req, res) {
  const question = await questionService.getAdminQuestion(assertUuid(req.params.questionId, 'questionId'));
  return sendSuccess(res, { question }, 200);
}

module.exports = {
  listContests,
  createContest,
  getContest,
  listQuestions,
  createQuestion,
  getQuestion,
};
