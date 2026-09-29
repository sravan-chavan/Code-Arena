const contestService = require('../contests/contest.service');
const questionService = require('../contests/question.service');
const submissionService = require('../submissions/submission.service');
const { listLanguages } = require('../config/languages');
const { sendSuccess } = require('../utils/api-response');
const { assertUuid } = require('../utils/input');

async function listContests(_req, res) {
  const contests = await contestService.listStudentContests();
  return sendSuccess(res, { contests }, 200);
}

async function getContest(req, res) {
  const contest = await contestService.getStudentContest(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { contest }, 200);
}

async function listQuestions(req, res) {
  const questions = await questionService.listStudentQuestions(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { questions }, 200);
}

async function getQuestion(req, res) {
  const question = await questionService.getStudentQuestion(
    assertUuid(req.params.id, 'id'),
    assertUuid(req.params.questionId, 'questionId'),
  );
  return sendSuccess(res, { question }, 200);
}

function languages(_req, res) {
  return sendSuccess(res, { languages: listLanguages() }, 200);
}

async function createExecution(req, res) {
  const submission = await submissionService.createAndEnqueue(req.user, req.body || {});
  return sendSuccess(res, { submission }, 202);
}

async function getSubmission(req, res) {
  const submission = await submissionService.getOwnedSubmission(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { submission }, 200);
}

async function listSubmissions(req, res) {
  const submissions = await submissionService.listOwnedSubmissions(req.user);
  return sendSuccess(res, { submissions }, 200);
}

module.exports = {
  listContests,
  getContest,
  listQuestions,
  getQuestion,
  languages,
  createExecution,
  getSubmission,
  listSubmissions,
};
