const express = require('express');
const OrganizationController = require('../controllers/Organization.controller');

const router = express.Router();

// Delegate routing to the controller
router.use('/', OrganizationController.router);

module.exports = router;