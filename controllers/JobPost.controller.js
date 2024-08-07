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
    this.router.get(
      "/getAllJobPost/:organizationId",
      this.getAllJobPostByOrganizationId.bind(this)
    );
    this.router.delete(
      "/delete/:id",
      authenticate,
      authorizeAdminOrOrganization,
      this.deleteJobPost.bind(this)
    );
    // this.router.get("/filterJobpost/:id", this.filter.bind(this));
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
  async getAllJobPostByOrganizationId(req, res) {
    try {
      const organizationId = req.params.organizationId;
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }
  
      const { due_date, status, priority } = req.query;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
  
      let whereClause = { OrganizationId: organizationId };
      let order = [];
  
      // Build dynamic order based on filter criteria
      if (due_date) order.push(['due_date', 'DESC']);
      if (status) order.push(['status', 'DESC']);
      if (priority) order.push(['priority', 'DESC']);
  
      // Add default ordering
      order.push(["createdAt", "DESC"]);
  
      const jobPosts = await models.JobPost.findAndCountAll({
        where: whereClause,
        order: order,
        attributes: { exclude: ["password"] },
      });
  
      if (!jobPosts.rows.length) {
        return res.status(404).json({success: false, message: "No Job Posts found" });
      }
  
     // Filter and sort the results
     const filteredAndSortedPosts = jobPosts.rows.sort((a, b) => {
      const aMatch = (!due_date || a.due_date === due_date) &&
                     (!status || a.status === status) &&
                     (!priority || a.priority === priority);
      const bMatch = (!due_date || b.due_date === due_date) &&
                     (!status || b.status === status) &&
                     (!priority || b.priority === priority);

      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  
      // Apply pagination to the sorted results
      const paginatedPosts = filteredAndSortedPosts.slice(offset, offset + limit);
  
      res.json({
        success:true,
        data: paginatedPosts,
        total: jobPosts.count,
        totalPages: Math.ceil(jobPosts.count / limit),
        currentPage: page,
      });
    } catch (error) {
      console.error("Error in getAllJobPostByOrganizationId:", error);
      res.status(500).json({ error: error.message });
    }
  }
  
  deleteJobPost = async (req, res) => {
    let transaction;
    try {
      transaction = await sequelize.transaction();

      const id = req.params.id;
      const jobPost = await this.model.findByPk(id, { transaction });

      if (!jobPost) {
        await transaction.rollback();
        return res.status(404).json({ error: "JobPost not found" });
      }

      // This will delete the JobPost and all associated JobCards
      await jobPost.destroy({ transaction });

      await transaction.commit();
      return res
        .status(200)
        .json({
          message: "JobPost and associated JobCards deleted successfully",
        });
    } catch (error) {
      if (transaction) await transaction.rollback();
      console.error("Error in delete:", error);
      res.status(500).json({ error: error.message });
    }
  };
}

module.exports = new JobPostController();
