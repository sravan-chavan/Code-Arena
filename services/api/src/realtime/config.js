/**
 * WebSocket gateway settings. Defaults are safe for a single API instance.
 * Override through environment variables; do not scatter these numbers.
 */

function parsePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function loadRealtimeConfig(env = process.env) {
  return Object.freeze({
    enabled: parseBoolean(env.WS_ENABLED, true),
    path: (env.WS_PATH && String(env.WS_PATH).trim()) || '/ws',
    maxConnections: parsePositiveInt(env.WS_MAX_CONNECTIONS, 500, { min: 1, max: 100_000 }),
    maxConnectionsPerUser: parsePositiveInt(env.WS_MAX_CONNECTIONS_PER_USER, 4, { min: 1, max: 50 }),
    maxSubscriptionsPerConnection: parsePositiveInt(env.WS_MAX_SUBSCRIPTIONS_PER_CONNECTION, 8, {
      min: 1,
      max: 100,
    }),
    authTimeoutMs: parsePositiveInt(env.WS_AUTH_TIMEOUT_MS, 5_000, { min: 500, max: 60_000 }),
    heartbeatIntervalMs: parsePositiveInt(env.WS_HEARTBEAT_INTERVAL_MS, 25_000, { min: 1_000, max: 120_000 }),
    maxPayloadBytes: parsePositiveInt(env.WS_MAX_PAYLOAD_BYTES, 65_536, { min: 1024, max: 1_048_576 }),
    maxMalformedMessages: parsePositiveInt(env.WS_MAX_MALFORMED_MESSAGES, 5, { min: 1, max: 50 }),
    rankingSnapshotMax: parsePositiveInt(env.WS_RANKING_SNAPSHOT_MAX, 200, { min: 1, max: 5_000 }),
    contestWatchEnabled: parseBoolean(env.WS_CONTEST_WATCH_ENABLED, true),
    contestWatchIntervalMs: parsePositiveInt(env.WS_CONTEST_WATCH_INTERVAL_MS, 5_000, {
      min: 1_000,
      max: 60_000,
    }),
    contestEndingLeadSeconds: parsePositiveInt(env.WS_CONTEST_ENDING_LEAD_SECONDS, 60, {
      min: 5,
      max: 3_600,
    }),
  });
}

module.exports = {
  loadRealtimeConfig,
};
