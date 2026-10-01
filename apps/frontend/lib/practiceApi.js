import { api } from './apiClient';
import { isTerminalSubmission, pollUntilTerminal } from './controlledPoll';

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

export async function fetchPracticeSubmission(id, opts) {
  const data = await api.get(`/student/practice/submissions/${id}`, opts);
  return data.submission;
}

export async function fetchPracticeSubmissions() {
  const data = await api.get('/student/practice/submissions');
  return data.submissions || [];
}

export async function pollPracticeSubmission(id, { timeoutMs = 45000, signal } = {}) {
  return pollUntilTerminal(() => fetchPracticeSubmission(id, { signal }), {
    timeoutMs,
    signal,
    isTerminal: isTerminalSubmission,
  });
}
