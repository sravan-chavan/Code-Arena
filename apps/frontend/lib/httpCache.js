/**
 * In-flight deduplication and short-lived cache for identical GET work.
 * A TTL of 0 still collapses concurrent callers onto one request.
 */

const inflight = new Map();
const store = new Map();

function deduped(key, fetcher, { ttlMs = 0, force = false } = {}) {
  if (!force && ttlMs > 0) {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) {
      return Promise.resolve(hit.value);
    }
  }
  if (!force && inflight.has(key)) {
    return inflight.get(key);
  }
  const promise = Promise.resolve()
    .then(() => fetcher())
    .then((value) => {
      if (ttlMs > 0) {
        store.set(key, { at: Date.now(), value });
      }
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, promise);
  return promise;
}

function invalidate(prefix) {
  for (const key of store.keys()) {
    if (!prefix || key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

function resetHttpCache() {
  inflight.clear();
  store.clear();
}

module.exports = {
  deduped,
  invalidate,
  resetHttpCache,
};
