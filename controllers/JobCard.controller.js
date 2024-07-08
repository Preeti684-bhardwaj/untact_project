const BaseController = require('./base');
const models = require('../models');
const { Op } = require('sequelize');
class JobCardController extends BaseController {
	constructor() {
		super(models.JobCard);
	}
	listArgVerify(req,res,queryOptions)
	{
	}
}

module.exports = new JobCardController();
