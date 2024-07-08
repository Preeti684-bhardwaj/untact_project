const express = require('express');
const AdminController = require('../controllers/Admin.controller');

const router = express.Router();

// Delegate routing to the controller
router.use('/', AdminController.router);

module.exports = router;
