const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const MAX_EMAIL_LENGTH = 254;

function validateRegistration({ email, password, confirmPassword }) {
  if (typeof email !== 'string' || email.trim() === '') {
    return 'email is required';
  }
  const normalized = email.trim().toLowerCase();
  if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalized)) {
    return 'email must be a valid email address';
  }
  if (typeof password !== 'string' || password.length === 0) {
    return 'password is required';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return null;
}

module.exports = {
  EMAIL_PATTERN,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_EMAIL_LENGTH,
  validateRegistration,
};
