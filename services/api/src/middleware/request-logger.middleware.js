/**
 * Lightweight request logger — method, path, status, duration, request id.
 *
 * Intentionally does not log request bodies, Authorization headers, JWTs,
 * passwords, or password hashes.
 */
function requestLoggerMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const requestId = req.requestId || '-';
    const path = req.originalUrl ? req.originalUrl.split('?')[0] : '-';
    console.log(
      `[API] ${req.method} ${path} ${res.statusCode} ${durationMs.toFixed(1)}ms requestId=${requestId}`,
    );
  });

  next();
}

module.exports = requestLoggerMiddleware;
