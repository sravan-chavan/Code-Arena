'use client';

import { getRealtimeClient } from './realtimeClient';
import { pollUntilTerminal, isTerminalSubmission } from './controlledPoll';
import { submissionView } from './realtimeConfig';

export async function awaitExecutionResult(submissionId, fetchOnce, {
  timeoutMs = 45000,
  signal,
  onEvent,
} = {}) {
  if (signal?.aborted) {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    throw error;
  }
  try {
    const payload = await getRealtimeClient().waitForSubmission(submissionId, {
      timeoutMs,
      onEvent,
    });
    return submissionView(payload, submissionId);
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw err;
    }
    if (err?.code !== 'WS_UNAVAILABLE' && err?.code !== 'WS_TIMEOUT') {
      throw err;
    }
    const fallbackMs = err.code === 'WS_TIMEOUT' ? Math.min(15_000, timeoutMs) : timeoutMs;
    return pollUntilTerminal(fetchOnce, {
      timeoutMs: fallbackMs,
      signal,
      isTerminal: isTerminalSubmission,
    });
  }
}
