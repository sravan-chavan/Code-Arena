const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const MAX_EMAIL_LENGTH = 254;

function registrationFieldErrors({ email, password, confirmPassword } = {}) {
  const errors = {};
  if (typeof email !== 'string' || email.trim() === '') {
    errors.email = 'email is required';
  } else {
    const normalized = email.trim().toLowerCase();
    if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalized)) {
      errors.email = 'email must be a valid email address';
    }
  }
  if (typeof password !== 'string' || password.length === 0) {
    errors.password = 'password is required';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

function validateRegistration(input) {
  const errors = registrationFieldErrors(input);
  return errors.email || errors.password || errors.confirmPassword || null;
}

module.exports = {
  EMAIL_PATTERN,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_EMAIL_LENGTH,
  registrationFieldErrors,
  validateRegistration,
};
