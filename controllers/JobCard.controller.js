const BaseController = require("./base");
const models = require("../models");
const sequelize = require("../config/db.config").sequelize;
// const {
//   authenticate,
//   authorizeAdminOrOrganization,
// } = require("../controllers/auth");

class JobCardController extends BaseController {
  constructor() {
    super(models.JobCard);
    
    // Add a new route for getting JobCards by JobPostId
    this.router.get('/byJobPost/:jobPostId', this.getByJobPostId.bind(this));
  }

  listArgVerify(req, res, queryOptions) {
    // Implementation specific to JobCardController if needed
  }

  async afterCreate(req, res, newObject, transaction) {
    // Additional setup after creating a JobCard if necessary
  }

  async getByJobPostId(req, res) {
    try {
      const { jobPostId } = req.params;

      const jobCards = await this.model.findAll({
        where: { JobPostId: jobPostId },
        order: [['createdAt', 'DESC']] // Optional: Order by creation date, newest first
      });

      if (jobCards.length === 0) {
        return res.status(404).json({ message: "No JobCards found for this JobPost" });
      }

      res.status(200).json(jobCards);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new JobCardController();