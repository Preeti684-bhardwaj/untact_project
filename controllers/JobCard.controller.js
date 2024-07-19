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
    this.router.get("/byJobPost/:jobPostId", this.getByJobPostId.bind(this));
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
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      const jobCards = await this.model.findAndCountAll({
        where: { JobPostId: jobPostId },
        order: [["createdAt", "DESC"]], // Optional: Order by creation date, newest first
        limit: limit,
        offset: offset,
        attributes: { exclude: ["password"] },
        // order: [["id", "ASC"]],
      });

      if (jobCards.length === 0) {
        return res
          .status(404)
          .json({success:false, message: "No JobCards found for this JobPost" });
      }

      res
        .status(200)
        .json({
          success: true,
          data: jobCards,
          total: jobCards.count,
          totalPages: Math.ceil(jobCards.count / limit),
          currentPage: page,
        });
    } catch (error) {
      res.status(500).json({ success:false,error: error.message });
    }
  };
}

module.exports = new JobCardController();
