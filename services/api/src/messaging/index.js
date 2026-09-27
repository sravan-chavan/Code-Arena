/**
 * API messaging facade — re-exports @codearena/messaging.
 *
 * After M6 the API is producer-only at runtime. System-consumer helpers remain
 * available for infrastructure tests; server.js does not start them.
 */

const messaging = require('@codearena/messaging');

module.exports = messaging;
