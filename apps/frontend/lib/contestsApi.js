import { api } from './apiClient';

export async function fetchLanguages() {
  const data = await api.get('/student/languages');
  return data.languages || [];
}

export async function fetchStudentContests() {
  const data = await api.get('/student/contests');
  return data.contests || [];
}

export async function fetchStudentContest(id) {
  const data = await api.get(`/student/contests/${id}`);
  return data.contest;
}

export async function registerForContest(id) {
  const data = await api.post(`/student/contests/${id}/register`, {});
  return data.registration;
}

export async function enterContest(id) {
  const data = await api.post(`/student/contests/${id}/enter`, {});
  return data.session;
}

export async function fetchContestSession(id) {
  const data = await api.get(`/student/contests/${id}/session`);
  return data.session;
}

export async function exitContest(id) {
  const data = await api.post(`/student/contests/${id}/exit`, {});
  return data.session;
}

export async function setCurrentQuestion(contestId, questionId) {
  const data = await api.post(`/student/contests/${contestId}/current-question`, { questionId });
  return data.session;
}

export async function reportContestViolation(contestId, type = 'TAB_SWITCH') {
  const data = await api.post(`/student/contests/${contestId}/violations`, { type });
  return data;
}

export async function fetchStudentRanking(contestId) {
  const data = await api.get(`/student/contests/${contestId}/ranking`);
  return data.ranking || [];
}

export async function fetchStudentContestSubmissions(contestId) {
  const data = await api.get(`/student/contests/${contestId}/submissions`);
  return data.submissions || [];
}

export async function fetchStudentRegistration(id) {
  const data = await api.get(`/student/contests/${id}/registration`);
  return data.registration;
}

export async function fetchStudentQuestions(contestId) {
  const data = await api.get(`/student/contests/${contestId}/questions`);
  return data.questions || [];
}

export async function createExecution({ contestId, questionId, language, sourceCode, kind }) {
  const data = await api.post('/student/executions', {
    contestId,
    questionId,
    language,
    sourceCode,
    kind,
  });
  return data.submission;
}

export async function fetchSubmission(id) {
  const data = await api.get(`/student/submissions/${id}`);
  return data.submission;
}

export async function fetchStudentSubmissions() {
  const data = await api.get('/student/submissions');
  return data.submissions || [];
}

export async function pollSubmission(id, { timeoutMs = 45000, intervalMs = 800 } = {}) {
  const started = Date.now();
  const terminal = new Set([
    'ACCEPTED',
    'WRONG_ANSWER',
    'TIME_LIMIT_EXCEEDED',
    'COMPILATION_ERROR',
    'RUNTIME_ERROR',
    'INTERNAL_ERROR',
  ]);
  while (Date.now() - started < timeoutMs) {
    const submission = await fetchSubmission(id);
    if (terminal.has(submission.status) && submission.status !== 'QUEUED' && submission.status !== 'RUNNING') {
      return submission;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for the execution result.');
}

export async function fetchAdminContests() {
  const data = await api.get('/admin/contests');
  return data.contests || [];
}

export async function createAdminContest(body) {
  const data = await api.post('/admin/contests', body);
  return data.contest;
}

export async function fetchAdminContest(id) {
  const data = await api.get(`/admin/contests/${id}`);
  return data.contest;
}

export async function updateAdminContest(id, body) {
  const data = await api.patch(`/admin/contests/${id}`, body);
  return data.contest;
}

export async function scheduleAdminContest(id) {
  const data = await api.post(`/admin/contests/${id}/schedule`, {});
  return data.contest;
}

export async function cancelAdminContest(id) {
  const data = await api.post(`/admin/contests/${id}/cancel`, {});
  return data.contest;
}

export async function endAdminContest(id) {
  const data = await api.post(`/admin/contests/${id}/end`, {});
  return data.contest;
}

export async function fetchAdminParticipants(id) {
  const data = await api.get(`/admin/contests/${id}/participants`);
  return data.participants || [];
}

export async function removeAdminParticipant(contestId, participantId) {
  const data = await api.post(`/admin/contests/${contestId}/participants/${participantId}/remove`, {});
  return data.participant;
}

export async function fetchAdminRanking(contestId) {
  const data = await api.get(`/admin/contests/${contestId}/ranking`);
  return data.ranking || [];
}

export async function fetchAdminContestSubmissions(contestId) {
  const data = await api.get(`/admin/contests/${contestId}/submissions`);
  return data.submissions || [];
}

export async function fetchAdminViolations(contestId) {
  const data = await api.get(`/admin/contests/${contestId}/violations`);
  return data.violations || [];
}

export async function fetchAdminQuestions(contestId) {
  const path = contestId ? `/admin/contests/${contestId}/questions` : '/admin/questions';
  const data = await api.get(path);
  return data.questions || [];
}

export async function fetchAdminQuestion(questionId) {
  const data = await api.get(`/admin/questions/${questionId}`);
  return data.question;
}

export async function createAdminQuestion(contestId, body) {
  const data = await api.post(`/admin/contests/${contestId}/questions`, body);
  return data.question;
}

export async function createAdminLibraryQuestion(body) {
  const data = await api.post('/admin/questions', body);
  return data.question;
}

export async function updateAdminQuestion(questionId, body) {
  const data = await api.patch(`/admin/questions/${questionId}`, body);
  return data.question;
}

export async function attachAdminQuestion(contestId, questionId) {
  const data = await api.post(`/admin/contests/${contestId}/questions/${questionId}`, {});
  return data.question;
}

export async function attachAdminQuestions(contestId, questionIds) {
  const data = await api.post(`/admin/contests/${contestId}/questions/batch`, { questionIds });
  return data.questions || [];
}

export async function reorderAdminQuestions(contestId, questionIds) {
  const data = await api.patch(`/admin/contests/${contestId}/questions/order`, { questionIds });
  return data.questions || [];
}

export async function fetchAdminTestCases(questionId) {
  const data = await api.get(`/admin/questions/${questionId}/test-cases`);
  return data.testCases || [];
}

export async function createAdminTestCase(questionId, body) {
  const data = await api.post(`/admin/questions/${questionId}/test-cases`, body);
  return data.testCase;
}

export async function updateAdminTestCase(questionId, testCaseId, body) {
  const data = await api.patch(`/admin/questions/${questionId}/test-cases/${testCaseId}`, body);
  return data.testCase;
}

export async function deleteAdminTestCase(questionId, testCaseId) {
  const data = await api.delete(`/admin/questions/${questionId}/test-cases/${testCaseId}`);
  return data.testCase;
}

export function questionContests(question) {
  if (!question || !Array.isArray(question.contests)) return [];
  return question.contests.filter((row) => row && row.id);
}

export function belongsToContest(question, contestId) {
  if (!question || !contestId) return false;
  if (question.contestId === contestId) return true;
  return questionContests(question).some((row) => row.id === contestId);
}

export function assignmentLabel(question) {
  if (!question) return 'Unassigned';
  if (question.assignment === 'practice' || question.isPractice) return 'Practice';
  const contests = questionContests(question);
  if (question.assignment === 'contest' || contests.length > 0) {
    if (contests.length === 1) return contests[0].title || 'Contest';
    if (contests.length > 1) return `Assigned to ${contests.length} contests`;
    return question.contestTitle || 'Contest';
  }
  return 'Unassigned';
}

export function formatStatus(status) {
  return String(status || '').replace(/_/g, ' ');
}
