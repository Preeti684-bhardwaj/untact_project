const express = require('express');
const AgentController = require('../controllers/Agent.controller');

const router = express.Router();

// Delegate routing to the controller
router.use('/', AgentController.router);

module.exports = router;