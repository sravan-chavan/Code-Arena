const { attachGateway } = require('./gateway');
const { startContestWatcher, stopContestWatcher } = require('./lifecycle-watcher');
const { loadRealtimeConfig } = require('./config');

let gateway = null;

function attachRealtime(server, options = {}) {
  const config = options.config || loadRealtimeConfig();
  gateway = attachGateway(server, { ...options, config });
  if (config.enabled && config.contestWatchEnabled) {
    startContestWatcher({ config });
  }
  return gateway;
}

function closeRealtime() {
  stopContestWatcher();
  if (gateway) {
    gateway.close();
    gateway = null;
  }
}

function realtimeStats() {
  return gateway ? gateway.stats() : { connections: 0, subscriptions: 0, enabled: false };
}

module.exports = {
  attachRealtime,
  closeRealtime,
  realtimeStats,
};
