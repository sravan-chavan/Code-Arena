/**
 * Service identity for shared messaging logs and AMQP appId.
 *
 * Defaults stay API-compatible for tests that do not set CODEARENA_SERVICE_NAME.
 * Configure via configureMessagingIdentity() or CODEARENA_SERVICE_NAME.
 */

/** @type {{ serviceName: string, appId: string, logPrefix: string }} */
let identity = {
  serviceName: 'api',
  appId: 'codearena-api',
  logPrefix: 'API',
};

/**
 * @param {{ serviceName?: string, appId?: string, logPrefix?: string }} [options]
 * @param {NodeJS.ProcessEnv} [env]
 */
function configureMessagingIdentity(options = {}, env = process.env) {
  const fromEnv = typeof env.CODEARENA_SERVICE_NAME === 'string'
    ? env.CODEARENA_SERVICE_NAME.trim()
    : '';
  const serviceName = (options.serviceName || fromEnv || 'api').trim() || 'api';
  const logPrefix = (options.logPrefix || serviceName.toUpperCase()).trim() || 'API';
  const appId = (options.appId || `codearena-${serviceName}`).trim() || `codearena-${serviceName}`;
  identity = Object.freeze({ serviceName, appId, logPrefix });
  return identity;
}

function getMessagingIdentity() {
  return identity;
}

function messagingLogPrefix() {
  return `[${identity.logPrefix}]`;
}

module.exports = {
  configureMessagingIdentity,
  getMessagingIdentity,
  messagingLogPrefix,
};
