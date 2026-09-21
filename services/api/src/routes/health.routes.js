const express = require('express');
const healthController = require('../controllers/health.controller');
const asyncHandler = require('../utils/async-handler');

const router = express.Router();

router.get('/', asyncHandler(healthController.getHealth));

module.exports = router;
