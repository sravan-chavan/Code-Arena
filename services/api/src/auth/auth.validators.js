const { validate } = require('../middleware/validation.middleware');
const { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } = require('./password');
const { MAX_EMAIL_LENGTH } = require('./email');

const credentialsBody = {
  email: {
    type: 'string',
    required: true,
    maxLength: MAX_EMAIL_LENGTH,
  },
  password: {
    type: 'string',
    required: true,
    minLength: MIN_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_LENGTH,
  },
};

const validateRegister = validate({ body: credentialsBody });
const validateLogin = validate({ body: credentialsBody });

module.exports = {
  validateRegister,
  validateLogin,
};
