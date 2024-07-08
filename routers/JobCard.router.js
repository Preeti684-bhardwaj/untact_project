const express = require('express');
const JobCardController = require('../controllers/JobCard.controller');

const router = express.Router();

// Delegate routing to the controller
router.use('/', JobCardController.router);

module.exports = router;