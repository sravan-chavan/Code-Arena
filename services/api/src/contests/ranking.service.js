const AppError = require('../errors/AppError');
const contestRepository = require('../repositories/contest.repository');
const participantRepository = require('../repositories/participant.repository');
const { assignRanks } = require('./scoring');

async function requireContest(id) {
  const contest = await contestRepository.findById(id);
  if (!contest) {
    throw new AppError('Contest not found', 404, { code: 'NOT_FOUND' });
  }
  return contest;
}

function toRankRow(participant, { includeEmail }) {
  return {
    participantId: participant.id,
    userId: participant.userId,
    email: includeEmail ? participant.email : undefined,
    status: participant.status,
    score: participant.score,
    penalty: participant.penalty,
    possibleScore: participant.possibleScore,
    solvedCount: participant.solvedCount,
    tabSwitchCount: participant.tabSwitchCount,
    lastScoringAt: participant.lastScoringAt,
  };
}

async function rankingForContest(contestId, { includeEmail = false } = {}) {
  await requireContest(contestId);
  const participants = await participantRepository.listByContestId(contestId);
  const rows = assignRanks(participants.map((row) => toRankRow(row, { includeEmail })));
  if (!includeEmail) {
    return rows.map(({ email, ...rest }) => rest);
  }
  return rows;
}

module.exports = {
  rankingForContest,
};
