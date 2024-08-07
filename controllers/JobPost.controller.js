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
  async filterOrganization(req, res) {
    try {
      const { page = 1, limit, due_date, name, status } = req.query;
  
      // Validate page and limit
      const pageValue = parseInt(page, 10);
      const limitValue = parseInt(limit, 10);
  
      if (isNaN(pageValue) || pageValue <= 0) {
        return res.status(400).json({ success: false, error: "Invalid page number" });
      }
      if (isNaN(limitValue) || limitValue <= 0) {
        return res.status(400).json({ success: false, error: "Invalid limit number" });
      }
  
      const offset = (pageValue - 1) * limitValue;
  
      let order = [];
      let whereClause = {};
      let includeWhereClause = {};
  
      // Validate and add filters for due_date in jobPosts
      if (due_date) {
        if (isNaN(Date.parse(due_date))) {
          return res.status(400).json({ success: false, error: "Invalid due date format" });
        }
        includeWhereClause[sequelize.where(sequelize.fn('DATE', sequelize.col('due_date')), due_date)] = due_date;
        order.push([sequelize.literal(`CASE WHEN DATE("jobPosts"."due_date") = '${due_date}' THEN 0 ELSE 1 END`), "ASC"]);
      }
  
      // Validate and add filters for status in jobPosts
      if (status) {
        includeWhereClause.status = status;
        order.push([sequelize.literal(`CASE WHEN "jobPosts"."status" = '${status}' THEN 0 ELSE 1 END`), "ASC"]);
      }
  
      // Validate and add filters for name
      if (name) {
        if (typeof name !== "string" || name.trim() === "") {
          return res.status(400).json({ success: false, error: "Invalid name format" });
        }
        whereClause.name = name.trim();
        order.push([sequelize.literal(`CASE WHEN "Organization"."name" = '${name.trim()}' THEN 0 ELSE 1 END`), "ASC"]);
      }
  
      // Add default ordering
      order.push(["createdAt", "DESC"]);
  
      // Define query options
      const queryOptions = {
        where: whereClause,
        order: order,
        attributes: { exclude: ["password"] },
        limit: limitValue,
        offset: offset,
        include: [
          {
            model: models.JobPost,
            as: "jobPosts",
            where: includeWhereClause,
            required: false, // This will ensure organizations without matching job posts are also included
          },
        ],
      };
  
      // Fetch the filtered results
      const results = await models.Organization.findAndCountAll(queryOptions);
  
      // Check if results are empty
      if (!results.rows.length) {
        return res.status(404).json({
          success: false,
          message: "No matching organizations found",
        });
      }
  
      // Filter and sort the results
      const filteredAndSortedResults = results.rows.sort((a, b) => {
        const aMatch =
          (!due_date || a.jobPosts.some(job => new Date(job.due_date).toISOString().split('T')[0] === due_date)) &&
          (!status || a.jobPosts.some(job => job.status === status));
        const bMatch =
          (!due_date || b.jobPosts.some(job => new Date(job.due_date).toISOString().split('T')[0] === due_date)) &&
          (!status || b.jobPosts.some(job => job.status === status));
  
        const aNameMatch = !name || a.name === name;
        const bNameMatch = !name || b.name === name;
  
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
  
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
  
        return 0;
      });
  
      // Apply pagination to the sorted results
      const paginatedResults = filteredAndSortedResults.slice(
        offset,
        offset + limitValue
      );
  
      res.status(200).json({
        success: true,
        data: paginatedResults,
        total: results.count,
        totalPages: Math.ceil(results.count / limitValue),
        currentPage: pageValue,
      });
    } catch (error) {
      console.error("Error in filterOrganization:", error);
      res.status(500).json({
        success: false,
        error: `Internal server error: ${error.message}`,
      });
    }
  }
  
//========= delete  JobPost  
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
