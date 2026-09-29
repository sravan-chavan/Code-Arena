const { Judge0Error } = require('./errors');
const {
  JUDGE0_STATUS,
  JUDGE0_STATUS_NAME,
  IN_PROGRESS_STATUS_IDS,
  isInProgressJudge0Status,
  isTerminalJudge0Status,
  judge0StatusName,
} = require('./statuses');
const {
  EXECUTION_STATUS,
  JUDGE0_TO_EXECUTION_STATUS,
  mapJudge0Status,
  mapJudge0Submission,
} = require('./mapping');
const {
  normalizeOutput,
  outputsMatch,
  isExecutionFailure,
  verdictForCase,
} = require('./evaluate');
const {
  loadJudge0Config,
  validateJudge0Config,
  describeJudge0Endpoint,
} = require('./config');
const { createJudge0Client } = require('./client');
const { pollUntilTerminal } = require('./poller');

module.exports = {
  Judge0Error,
  JUDGE0_STATUS,
  JUDGE0_STATUS_NAME,
  IN_PROGRESS_STATUS_IDS,
  isInProgressJudge0Status,
  isTerminalJudge0Status,
  judge0StatusName,
  EXECUTION_STATUS,
  JUDGE0_TO_EXECUTION_STATUS,
  mapJudge0Status,
  mapJudge0Submission,
  normalizeOutput,
  outputsMatch,
  isExecutionFailure,
  verdictForCase,
  loadJudge0Config,
  validateJudge0Config,
  describeJudge0Endpoint,
  createJudge0Client,
  pollUntilTerminal,
};
