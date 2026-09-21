/**
 * Lightweight request logger — method, path, status, duration, request id.
 */
function requestLoggerMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const requestId = req.requestId || '-';
    console.log(
      `[API] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms requestId=${requestId}`,
    );
  });

  next();
}

module.exports = requestLoggerMiddleware;
