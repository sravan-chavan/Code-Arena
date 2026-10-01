function canResumeContest(contest) {
  return contest?.status === 'ended'
    && Array.isArray(contest.allowedActions)
    && contest.allowedActions.includes('resume');
}

module.exports = { canResumeContest };
