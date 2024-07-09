const express = require('express');
const JobPostController = require('../controllers/JobPost.controller');

const router = express.Router();

// Delegate routing to the controller
router.use('/', JobPostController.router);

module.exports = router;