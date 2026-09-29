const questionService = require('../contests/question.service');
const submissionService = require('../submissions/submission.service');
const { sendSuccess } = require('../utils/api-response');
const { assertUuid } = require('../utils/input');

async function listProblems(_req, res) {
  const problems = await questionService.listPracticeProblems();
  return sendSuccess(res, { problems }, 200);
}

async function getProblem(req, res) {
  const problem = await questionService.getPracticeProblem(assertUuid(req.params.id, 'id'));
  return sendSuccess(res, { problem }, 200);
}

async function createExecution(req, res) {
  const submission = await submissionService.createPracticeAndEnqueue(req.user, req.body || {});
  return sendSuccess(res, { submission }, 202);
}

async function listSubmissions(req, res) {
  const submissions = await submissionService.listOwnedPracticeSubmissions(req.user);
  return sendSuccess(res, { submissions }, 200);
}

async function getSubmission(req, res) {
  const submission = await submissionService.getOwnedPracticeSubmission(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { submission }, 200);
}

module.exports = {
  listProblems,
  getProblem,
  createExecution,
  listSubmissions,
  getSubmission,
};
