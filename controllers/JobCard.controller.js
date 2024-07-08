const BaseController = require("./base");
const models = require("../models");
const sequelize = require("../config/db.config").sequelize;
const {
  authenticate,
  authorizeAdminOrOrganization,
} = require("../controllers/auth");

class JobCardController extends BaseController {
  constructor() {
    super(models.JobCard);
    this.router.post(
      "/create",
      authenticate,
      authorizeAdminOrOrganization,
      this.create.bind(this)
    );
  }

  listArgVerify(req, res, queryOptions) {
    // Implementation specific to JobCardController if needed
  }

  async afterCreate(req, res, newObject, transaction) {
    // Additional setup after creating a JobCard if necessary
  }

  async create(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const { customerDetail, organizationId, ...jobCardData } = req.body;

      if (!customerDetail || !Array.isArray(customerDetail) || customerDetail.length === 0) {
        return res.status(400).json({ error: "Customer details are required" });
      }

      const createdJobCards = [];

      for (const customer of customerDetail) {
        const newData = {
          ...jobCardData,
          customerDetail: customer,
        };

        // Set organizationId or adminId based on user type
        if (req.userType === "ORGANIZATION") {
          newData.OrganizationId = req.userId;
        } else if (req.userType === "ADMIN") {
            if(!organizationId){
                return res.status(400).json({ error: "please provide organizationId" });
            }
            const existingOrganization = await models.Organization.findOne({ where: {id:organizationId  } });
            if(!existingOrganization){
                return res.status(404).json({ error: "organization not found" });
            }
            newData.AdminId = req.userId;

          // If admin is creating and organizationId is provided in the body
          if (organizationId) {
            newData.OrganizationId = organizationId;
          }
        } else {
          await transaction.rollback();
          return res.status(403).json({ error: "Unauthorized user type" });
        }

        const newItem = await this.model.create(newData, { transaction });
        await this.afterCreate(req, res, newItem, transaction);
        createdJobCards.push(newItem);
      }

      await transaction.commit();
      res.status(201).json(createdJobCards);
    } catch (error) {
      await transaction.rollback();
      res.status(400).json({ error: error.message });
    }
  }
}

module.exports = new JobCardController();