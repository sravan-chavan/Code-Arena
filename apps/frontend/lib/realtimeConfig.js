const LANGUAGE_TTL_MS = 5 * 60 * 1000;
const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 8000;
const RECONNECT_MAX_ATTEMPTS = 8;
const CONNECT_GRACE_MS = 2000;

function mergeRanking(previous, incoming) {
  const prior = new Map((previous || []).map((row) => [row.participantId, row]));
  return (incoming || []).map((row) => {
    const existing = prior.get(row.participantId) || {};
    return {
      ...existing,
      ...row,
      email: row.email || existing.email,
    };
  });
}

function submissionView(payload, fallbackId) {
  if (!payload) return null;
  return {
    ...payload,
    id: payload.submissionId || payload.id || fallbackId,
  };
}

module.exports = {
  LANGUAGE_TTL_MS,
  RECONNECT_INITIAL_MS,
  RECONNECT_MAX_MS,
  RECONNECT_MAX_ATTEMPTS,
  CONNECT_GRACE_MS,
  mergeRanking,
  submissionView,
};
