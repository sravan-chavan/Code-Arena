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

export async function fetchAdminQuestions(contestId) {
  const path = contestId ? `/admin/contests/${contestId}/questions` : '/admin/questions';
  const data = await api.get(path);
  return data.questions || [];
}

export async function createAdminQuestion(contestId, body) {
  const data = await api.post(`/admin/contests/${contestId}/questions`, body);
  return data.question;
}

export function formatStatus(status) {
  return String(status || '').replace(/_/g, ' ');
}
