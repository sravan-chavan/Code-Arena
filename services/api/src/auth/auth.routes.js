const express = require('express');
const authController = require('./auth.controller');
const { validateRegister, validateLogin } = require('./auth.validators');
const authenticate = require('../middleware/authentication.middleware');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();

router.post('/register', validateRegister, asyncHandler(authController.register));
router.post('/login', validateLogin, asyncHandler(authController.login));
router.get('/me', authenticate, asyncHandler(authController.me));

module.exports = router;
