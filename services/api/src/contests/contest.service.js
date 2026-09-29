const AppError = require('../errors/AppError');
const contestRepository = require('../repositories/contest.repository');
const { trimRequired } = require('../utils/input');

const STATUSES = new Set(['draft', 'scheduled', 'running', 'ended']);

function remainingSeconds(contest) {
  if (contest.status !== 'running' || !contest.startTime) {
    return null;
  }
  const start = Date.parse(contest.startTime);
  if (Number.isNaN(start)) {
    return null;
  }
  const endsAt = start + contest.durationMinutes * 60 * 1000;
  return Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
}

function toAdminContest(contest) {
  return {
    ...contest,
    remainingTime: remainingSeconds(contest),
  };
}

function toStudentContest(contest) {
  const { isDevelopmentSeed, createdBy, ...rest } = contest;
  return {
    ...rest,
    remainingTime: remainingSeconds(contest),
  };
}

async function createContest(user, body) {
  const title = trimRequired(body.title, 'title', 120);
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const status = body.status || 'running';
  if (!STATUSES.has(status)) {
    throw new AppError('status is invalid', 400, { code: 'VALIDATION_ERROR' });
  }
  const parsedDuration = Number.parseInt(String(body.durationMinutes), 10);
  const durationMinutes = Number.isInteger(parsedDuration) && parsedDuration > 0
    ? parsedDuration
    : 60;

  const contest = await contestRepository.create({
    title,
    description,
    status,
    startTime: status === 'running' ? new Date().toISOString() : body.startTime || null,
    durationMinutes,
    createdBy: user.id,
  });
  return toAdminContest(contest);
}

async function listAdminContests() {
  const contests = await contestRepository.listAll();
  return contests.map(toAdminContest);
}

async function getAdminContest(id) {
  const contest = await contestRepository.findById(id);
  if (!contest) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  return toAdminContest(contest);
}

async function listStudentContests() {
  const contests = await contestRepository.listVisibleToStudents();
  return contests.map(toStudentContest);
}

async function getStudentContest(id) {
  const contest = await contestRepository.findById(id);
  if (!contest || contest.status === 'draft') {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  return toStudentContest(contest);
}

module.exports = {
  createContest,
  listAdminContests,
  getAdminContest,
  listStudentContests,
  getStudentContest,
  toAdminContest,
  toStudentContest,
};
