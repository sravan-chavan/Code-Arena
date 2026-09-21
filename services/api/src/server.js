const { createApp } = require('./app');
const config = require('./config/environment');

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(
    `[API] Server started on ${config.host}:${config.port} (env=${config.env}, milestone=${config.milestone})`,
  );
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[API] ${signal} received — shutting down gracefully`);

  server.close((closeError) => {
    if (closeError) {
      console.error('[API] Error during HTTP server close:', closeError);
      process.exit(1);
      return;
    }
    console.log('[API] HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[API] Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = {
  app,
  server,
};
