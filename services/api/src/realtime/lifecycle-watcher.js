/**
 * One server-side timer that promotes scheduled contests to running and
 * running contests to ended, then publishes a single contest event.
 * This is not per-client HTTP polling.
 */

const lifecycle = require('../contests/contest.lifecycle');
const contestRepository = require('../repositories/contest.repository');
const notify = require('./notify');
const { loadRealtimeConfig } = require('./config');

let timer = null;
let ticking = false;

async function tick(config) {
  if (ticking) {
    return;
  }
  ticking = true;
  try {
    const contests = await contestRepository.listByStoredStatuses(['scheduled', 'running']);
    for (const contest of contests) {
      const effective = lifecycle.computeEffectiveStatus(contest);
      if (effective !== contest.status && (effective === 'running' || effective === 'ended' || effective === 'scheduled')) {
        const fields = { status: effective };
        if (effective === 'ended' && !contest.endTime) {
          fields.endTime = new Date().toISOString();
        }
        const updated = await contestRepository.update(contest.id, fields);
        notify.contestTransition(updated, contest.status);
        continue;
      }
      if (effective === 'running') {
        const remaining = lifecycle.remainingSeconds(contest);
        if (
          remaining != null
          && remaining > 0
          && remaining <= config.contestEndingLeadSeconds
        ) {
          notify.contestEnding(contest, remaining);
        }
      }
    }
  } catch (err) {
    console.error(`[API] Contest lifecycle watch failed: ${err.message}`);
  } finally {
    ticking = false;
  }
}

function startContestWatcher(options = {}) {
  const config = options.config || loadRealtimeConfig();
  if (!config.enabled || !config.contestWatchEnabled || timer) {
    return;
  }
  timer = setInterval(() => {
    void tick(config);
  }, config.contestWatchIntervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  void tick(config);
}

function stopContestWatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startContestWatcher,
  stopContestWatcher,
  tick,
};
