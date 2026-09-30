const questionRepository = require('../repositories/question.repository');
const questionStateRepository = require('../repositories/question-state.repository');
const participantRepository = require('../repositories/participant.repository');
const submissionRepository = require('../repositories/submission.repository');
const {
  sumTestCasePoints,
  participantPossibleScore,
  participantEarnedScore,
  calculatePenalty,
  lastScoringAt,
} = require('./scoring');

function questionTotalsFromCases(questions) {
  return questions.map((question) => ({
    questionId: question.id,
    totalPoints: sumTestCasePoints(question.testCases || []),
  }));
}

async function loadContestQuestionsWithCases(contestId, client) {
  const questions = await questionRepository.listByContestId(contestId, client);
  const withCases = [];
  for (const question of questions) {
    const testCases = await questionRepository.listTestCases(question.id, client);
    withCases.push({ ...question, testCases });
  }
  return withCases;
}

async function recomputeParticipant(contest, participant, client) {
  const questions = await loadContestQuestionsWithCases(contest.id, client);
  const states = await questionStateRepository.listByParticipant(
    contest.id,
    participant.id,
    client,
  );
  const stateByQuestion = new Map(states.map((row) => [row.questionId, row]));
  const submissions = await submissionRepository.listContestSubmitsForParticipant(
    contest.id,
    participant.id,
    client,
  );
  const submitsByQuestion = new Map();
  for (const submission of submissions) {
    const list = submitsByQuestion.get(submission.questionId) || [];
    list.push(submission);
    submitsByQuestion.set(submission.questionId, list);
  }

  const scoredQuestions = [];
  for (const question of questions) {
    const totalPoints = sumTestCasePoints(question.testCases);
    const state = stateByQuestion.get(question.id);
    const invalidated = Boolean(state && state.invalidated);
    const earnedPoints = invalidated ? 0 : Number(state && state.earnedPoints || 0);
    scoredQuestions.push({
      questionId: question.id,
      totalPoints,
      earnedPoints,
      invalidated,
      submissions: submitsByQuestion.get(question.id) || [],
    });
    await questionStateRepository.upsert({
      contestId: contest.id,
      participantId: participant.id,
      questionId: question.id,
      invalidated,
      invalidationReason: state && state.invalidationReason,
      invalidatedAt: state && state.invalidatedAt,
      earnedPoints,
      possiblePoints: invalidated ? 0 : totalPoints,
    }, client);
  }

  const score = participantEarnedScore(scoredQuestions);
  const possibleScore = participantPossibleScore(scoredQuestions);
  const penalty = calculatePenalty({ contest, participant, questions: scoredQuestions });
  const last = lastScoringAt(scoredQuestions);
  const solvedCount = scoredQuestions.filter((question) => (
    !question.invalidated
    && question.totalPoints > 0
    && question.earnedPoints >= question.totalPoints
  )).length;

  return participantRepository.update(participant.id, {
    score,
    penalty,
    possibleScore,
    solvedCount,
    lastScoringAt: last ? new Date(last).toISOString() : null,
  }, client);
}

async function applyQuestionScore(contest, participant, questionId, earnedPoints, client) {
  const testCases = await questionRepository.listTestCases(questionId, client);
  const totalPoints = sumTestCasePoints(testCases);
  const existing = await questionStateRepository.find(
    contest.id,
    participant.id,
    questionId,
    client,
  );
  if (existing && existing.invalidated) {
    await questionStateRepository.upsert({
      contestId: contest.id,
      participantId: participant.id,
      questionId,
      invalidated: true,
      invalidationReason: existing.invalidationReason,
      invalidatedAt: existing.invalidatedAt,
      earnedPoints: 0,
      possiblePoints: 0,
    }, client);
    return recomputeParticipant(contest, participant, client);
  }
  await questionStateRepository.upsert({
    contestId: contest.id,
    participantId: participant.id,
    questionId,
    invalidated: false,
    earnedPoints,
    possiblePoints: totalPoints,
  }, client);
  return recomputeParticipant(contest, participant, client);
}

module.exports = {
  questionTotalsFromCases,
  loadContestQuestionsWithCases,
  recomputeParticipant,
  applyQuestionScore,
};
