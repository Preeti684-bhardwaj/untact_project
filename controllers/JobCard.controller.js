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
    // this.router.get("/filterItem/:id", this.filter.bind(this));
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
      if (!jobPostId) {
        return res.status(400).json({ message: "Job Post ID is required" });
      }
  
      const { due_date, status, priority } = req.query;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
  
      let whereClause = { JobPostId: jobPostId };
      let order = [];
  
      // Build dynamic order based on filter criteria
      if (due_date) order.push(['due_date', 'DESC']);
      if (status) order.push(['status', 'DESC']);
      if (priority) order.push(['priority', 'DESC']);
  
      // Add default ordering
      order.push(["createdAt", "DESC"]);
  
      const jobCards = await models.JobCard.findAndCountAll({
        where: whereClause,
        order: order,
        attributes: { exclude: ["password"] },
      });
  
      if (!jobCards.rows.length) {
        return res.status(404).json({
          success: false,
          message: "No JobCards found for this JobPost",
        });
      }
  
      // Filter and sort the results
      const filteredAndSortedCards = jobCards.rows.sort((a, b) => {
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
      const paginatedCards = filteredAndSortedCards.slice(offset, offset + limit);
  
      res.status(200).json({
        success: true,
        data: paginatedCards,
        total: jobCards.count,
        totalPages: Math.ceil(jobCards.count / limit),
        currentPage: page,
      });
    } catch (error) {
      console.error("Error in getByJobPostId:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new JobCardController();
