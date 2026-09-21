const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function isValidEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }
  const normalized = normalizeEmail(email);
  return (
    normalized.length > 0 &&
    normalized.length <= MAX_EMAIL_LENGTH &&
    EMAIL_PATTERN.test(normalized)
  );
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  MAX_EMAIL_LENGTH,
};
