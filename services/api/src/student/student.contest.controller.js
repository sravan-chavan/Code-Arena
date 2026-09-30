const contestService = require('../contests/contest.service');
const questionService = require('../contests/question.service');
const submissionService = require('../submissions/submission.service');
const sessionService = require('../contests/session.service');
const { listLanguages } = require('../config/languages');
const { sendSuccess } = require('../utils/api-response');
const { assertUuid } = require('../utils/input');
const AppError = require('../errors/AppError');

async function listContests(req, res) {
  const contests = await contestService.listStudentContests(req.user);
  return sendSuccess(res, { contests }, 200);
}

async function getContest(req, res) {
  const contest = await contestService.getStudentContest(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { contest }, 200);
}

async function register(req, res) {
  const registration = await contestService.registerStudent(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { registration }, 201);
}

async function getRegistration(req, res) {
  const payload = await contestService.getStudentRegistration(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, payload, 200);
}

async function listQuestions(req, res) {
  const questions = await questionService.listStudentQuestions(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { questions }, 200);
}

async function getQuestion(req, res) {
  const question = await questionService.getStudentQuestion(
    req.user,
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

async function enter(req, res) {
  const session = await sessionService.enterContest(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { session }, 200);
}

async function getSession(req, res) {
  const session = await sessionService.getSession(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { session }, 200);
}

async function exit(req, res) {
  const session = await sessionService.exitContest(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { session }, 200);
}

async function setCurrentQuestion(req, res) {
  const session = await sessionService.setCurrentQuestion(
    req.user,
    assertUuid(req.params.id, 'id'),
    assertUuid((req.body || {}).questionId, 'questionId'),
  );
  return sendSuccess(res, { session }, 200);
}

async function reportViolation(req, res) {
  const type = (req.body || {}).type;
  if (type !== 'TAB_SWITCH') {
    throw new AppError('type must be TAB_SWITCH', 400, { code: 'VALIDATION_ERROR' });
  }
  const payload = await sessionService.reportTabSwitch(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, payload, 201);
}

async function ranking(req, res) {
  const rankingRows = await submissionService.getStudentRanking(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { ranking: rankingRows }, 200);
}

async function listContestSubmissions(req, res) {
  const submissions = await submissionService.listOwnedContestSubmissions(
    req.user,
    assertUuid(req.params.id, 'id'),
  );
  return sendSuccess(res, { submissions }, 200);
}

module.exports = {
  listContests,
  getContest,
  register,
  getRegistration,
  listQuestions,
  getQuestion,
  languages,
  createExecution,
  getSubmission,
  listSubmissions,
  enter,
  getSession,
  exit,
  setCurrentQuestion,
  reportViolation,
  ranking,
  listContestSubmissions,
};
