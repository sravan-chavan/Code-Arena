const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { deduped, invalidate, resetHttpCache } = require('./httpCache');

describe('HTTP deduplication', () => {
  it('shares one in-flight request across callers', async () => {
    resetHttpCache();
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fetcher = () => {
      calls += 1;
      return gate.then(() => 'contest');
    };
    const first = deduped('contest:1', fetcher);
    const second = deduped('contest:1', fetcher);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, 'contest');
    assert.equal(b, 'contest');
    assert.equal(calls, 1);
  });

  it('serves a fresh cached value and refetches after invalidation', async () => {
    resetHttpCache();
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return calls;
    };
    assert.equal(await deduped('languages', fetcher, { ttlMs: 60_000 }), 1);
    assert.equal(await deduped('languages', fetcher, { ttlMs: 60_000 }), 1);
    invalidate('languages');
    assert.equal(await deduped('languages', fetcher, { ttlMs: 60_000 }), 2);
    assert.equal(calls, 2);
  });
});
