/**
 * Consistent API response helpers.
 *
 * Success: { success: true, data, message? }
 * Failure: { success: false, message, errors? }
 */

function sendSuccess(res, data = {}, statusCode = 200, message) {
  const payload = {
    success: true,
    data,
  };

  if (message !== undefined) {
    payload.message = message;
  }

  return res.status(statusCode).json(payload);
}

function sendError(res, message, statusCode = 500, errors = [], code) {
  const payload = {
    success: false,
    message,
  };

  if (code) {
    payload.code = code;
  }

  if (Array.isArray(errors) && errors.length > 0) {
    payload.errors = errors;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  sendSuccess,
  sendError,
};
