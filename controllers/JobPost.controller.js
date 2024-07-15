const BaseController = require("./base");
const models = require("../models");
const sequelize = require("../config/db.config").sequelize;
const {
  authenticate,
  authorizeAdminOrOrganization,
} = require("../controllers/auth");

class JobPostController extends BaseController {
  constructor() {
    super(models.JobPost);
    this.router.post(
      "/create",
      authenticate,
      authorizeAdminOrOrganization,
      this.create.bind(this)
    );
    this.router.get("/getAllJobPost/:organizationId",this.getAllJobPostByOrganizationId.bind(this));
  }

  listArgVerify(req, res, queryOptions) {
    // Implementation specific to JobPostController if needed
  }

  async afterCreate(req, res, newJobPost, transaction) {
    // Create JobCards associated with the new JobPost
    const jobCards = req.body.jobCards || [];
    const jobCardPromises = jobCards.map(async (jobCardData) => {
      const newJobCardData = {
        job_title: newJobPost.job_title,
        job_description: newJobPost.job_description,
        customerDetail: jobCardData,
        priority: newJobPost.priority,
        due_date: newJobPost.due_date,
        status: newJobPost.status || "Open",
        JobPostId: newJobPost.id,
        OrganizationId: newJobPost.OrganizationId,
        AdminId: newJobPost.AdminId,
      };
      return models.JobCard.create(newJobCardData, { transaction });
    });

    await Promise.all(jobCardPromises);
  }

  async create(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const { organizationId, jobCards, ...jobPostData } = req.body;

      const newData = {
        ...jobPostData,
        jobCards: jobCards,
      };

      // Set organizationId or adminId based on user type
      if (req.userType === "ORGANIZATION") {
        newData.OrganizationId = req.userId;
      } else if (req.userType === "ADMIN") {
        if (!organizationId) {
          await transaction.rollback();
          return res
            .status(400)
            .json({ error: "Please provide organizationId" });
        }
        const existingOrganization = await models.Organization.findOne({
          where: { id: organizationId },
        });
        if (!existingOrganization) {
          await transaction.rollback();
          return res.status(404).json({ error: "Organization not found" });
        }
        newData.AdminId = req.userId;
        newData.OrganizationId = organizationId;
      } else {
        await transaction.rollback();
        return res.status(403).json({ error: "Unauthorized user type" });
      }

      const newJobPost = await this.model.create(newData, { transaction });

      await this.afterCreate(req, res, newJobPost, transaction);
      await transaction.commit();
      res.status(201).json(newJobPost);
    } catch (error) {
      await transaction.rollback();
      res.status(400).json({ error: error.message });
    }
  }
  getAllJobPostByOrganizationId = async (req, res) => {
    try {
      const organizationId = req.params.organizationId;
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      const jobPost = await models.Organization.findAndCountAll({
        where: {
          id: organizationId,
        },
        limit: limit,
        offset: offset,
        attributes: { exclude: ["password"] },
        order: [["id", "ASC"]],
      });
      if (!jobPost) {
        return res.status(404).json({ message: "Job Post not found" });
      }
      res.json({
        data: jobPost.rows,
        total: jobPost.count,
        totalPages: Math.ceil(jobPost.count / limit),
        currentPage: page,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
}

module.exports = new JobPostController();
