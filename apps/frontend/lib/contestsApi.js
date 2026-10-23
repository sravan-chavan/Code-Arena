import { api } from './apiClient';
import { deduped } from './httpCache';
import { LANGUAGE_TTL_MS } from './realtimeConfig';
import { isTerminalSubmission, pollUntilTerminal } from './controlledPoll';

export function fetchLanguages() {
  return deduped('student:languages', async () => {
    const data = await api.get('/student/languages');
    return data.languages || [];
  }, { ttlMs: LANGUAGE_TTL_MS });
}

export async function fetchStudentContests() {
  const data = await api.get('/student/contests');
  return data.contests || [];
}

export async function fetchStudentContest(id, opts) {
  return deduped(`student:contest:${id}`, async () => {
    const data = await api.get(`/student/contests/${id}`, opts);
    return data.contest;
  });
}

export async function registerForContest(id) {
  const data = await api.post(`/student/contests/${id}/register`, {});
  return data.registration;
}

export async function enterContest(id) {
  const data = await api.post(`/student/contests/${id}/enter`, {});
  return data.session;
}

export async function fetchContestSession(id, opts) {
  return deduped(`student:session:${id}`, async () => {
    const data = await api.get(`/student/contests/${id}/session`, opts);
    return data.session;
  });
}

export async function exitContest(id) {
  const data = await api.post(`/student/contests/${id}/exit`, {});
  return data.session;
}

export async function setCurrentQuestion(contestId, questionId) {
  const data = await api.post(`/student/contests/${contestId}/current-question`, { questionId });
  return data.session;
}

export async function reportContestViolation(contestId, typeOrOptions = 'TAB_SWITCH') {
  const options = typeof typeOrOptions === 'string' ? { type: typeOrOptions } : (typeOrOptions || {});
  const body = { type: options.type || 'TAB_SWITCH' };
  if (options.source) body.source = options.source;
  if (options.clientEventId) body.clientEventId = options.clientEventId;
  if (options.blurObserved) body.blurObserved = true;
  const data = await api.post(`/student/contests/${contestId}/violations`, body);
  return data;
}

export async function fetchStudentRanking(contestId, opts) {
  const data = await api.get(`/student/contests/${contestId}/ranking`, opts);
  return data.ranking || [];
}

export async function fetchStudentContestSubmissions(contestId, opts) {
  const data = await api.get(`/student/contests/${contestId}/submissions`, opts);
  return data.submissions || [];
}

export async function fetchStudentRegistration(id) {
  const data = await api.get(`/student/contests/${id}/registration`);
  return data.registration;
}

export async function fetchStudentQuestions(contestId, opts) {
  const data = await api.get(`/student/contests/${contestId}/questions`, opts);
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

export async function fetchSubmission(id, opts) {
  const data = await api.get(`/student/submissions/${id}`, opts);
  return data.submission;
}

export async function fetchStudentSubmissions() {
  const data = await api.get('/student/submissions');
  return data.submissions || [];
}

export async function pollSubmission(id, { timeoutMs = 45000, signal } = {}) {
  return pollUntilTerminal(() => fetchSubmission(id, { signal }), {
    timeoutMs,
    signal,
    isTerminal: isTerminalSubmission,
  });
}

export async function fetchAdminContests() {
  const data = await api.get('/admin/contests');
  return data.contests || [];
}

export async function createAdminContest(body) {
  const data = await api.post('/admin/contests', body);
  return data.contest;
}

export async function fetchAdminContest(id, opts) {
  return deduped(`admin:contest:${id}`, async () => {
    const data = await api.get(`/admin/contests/${id}`, opts);
    return data.contest;
  });
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

export async function resumeAdminContest(id, body) {
  const data = await api.post(`/admin/contests/${id}/resume`, body);
  return data.contest;
}

export async function fetchAdminParticipants(id, opts) {
  const data = await api.get(`/admin/contests/${id}/participants`, opts);
  return data.participants || [];
}

export async function removeAdminParticipant(contestId, participantId) {
  const data = await api.post(`/admin/contests/${contestId}/participants/${participantId}/remove`, {});
  return data.participant;
}

export async function readdAdminParticipant(contestId, participantId) {
  const data = await api.post(`/admin/contests/${contestId}/participants/${participantId}/re-add`, {});
  return data.participant;
}

export async function fetchAdminRanking(contestId, opts) {
  const data = await api.get(`/admin/contests/${contestId}/ranking`, opts);
  return data.ranking || [];
}

export async function fetchAdminContestSubmissions(contestId, opts) {
  const data = await api.get(`/admin/contests/${contestId}/submissions`, opts);
  return data.submissions || [];
}

export async function fetchAdminViolations(contestId, opts) {
  const data = await api.get(`/admin/contests/${contestId}/violations`, opts);
  return data.violations || [];
}

export async function fetchAdminQuestions(contestId, opts) {
  const path = contestId ? `/admin/contests/${contestId}/questions` : '/admin/questions';
  const data = await api.get(path, opts);
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

export async function updateQuestionPlacement(questionId, body) {
  const data = await api.patch(`/admin/questions/${questionId}/placement`, body);
  return data.question;
}

export async function bulkManageQuestions(body) {
  return api.post('/admin/questions/bulk', body);
}

export async function deleteAdminQuestion(questionId) {
  const data = await api.delete(`/admin/questions/${questionId}`);
  return data.question;
}

export async function archiveAdminQuestion(questionId) {
  return api.post(`/admin/questions/${questionId}/archive`, {});
}

export async function detachAdminQuestion(contestId, questionId) {
  const data = await api.delete(`/admin/contests/${contestId}/questions/${questionId}`);
  return data.question;
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
  if (question.archived || question.assignment === 'archived') return 'Archived';
  const contests = questionContests(question);
  const inPractice = Boolean(question.isPractice || question.assignment === 'practice' || question.assignment === 'both');
  const inContest = question.assignment === 'contest' || question.assignment === 'both' || contests.length > 0;
  if (inPractice && inContest) {
    if (contests.length === 1) return `Practice · ${contests[0].title || 'Contest'}`;
    if (contests.length > 1) return `Practice · ${contests.length} contests`;
    return 'Practice and contests';
  }
  if (question.assignment === 'practice' || (inPractice && !inContest)) return 'Practice';
  if (inContest) {
    if (contests.length === 1) return contests[0].title || 'Contest';
    if (contests.length > 1) return `Assigned to ${contests.length} contests`;
    return question.contestTitle || 'Contest';
  }
  return 'Unassigned';
}

export function formatStatus(status) {
  return String(status || '').replace(/_/g, ' ');
}
