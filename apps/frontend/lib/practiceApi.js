import { api } from './apiClient';

export async function fetchPracticeProblems() {
  const data = await api.get('/student/practice/problems');
  return data.problems || [];
}

export async function fetchPracticeProblem(id) {
  const data = await api.get(`/student/practice/problems/${id}`);
  return data.problem;
}

export async function createPracticeExecution({ questionId, language, sourceCode, kind }) {
  const data = await api.post('/student/practice/executions', {
    questionId,
    language,
    sourceCode,
    kind,
  });
  return data.submission;
}

export async function fetchPracticeSubmission(id) {
  const data = await api.get(`/student/practice/submissions/${id}`);
  return data.submission;
}

export async function fetchPracticeSubmissions() {
  const data = await api.get('/student/practice/submissions');
  return data.submissions || [];
}

export async function pollPracticeSubmission(id, { timeoutMs = 45000, intervalMs = 800 } = {}) {
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
    const submission = await fetchPracticeSubmission(id);
    if (terminal.has(submission.status)) {
      return submission;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for the execution result.');
}
