const db = require("../config/db.config.js");
const axios = require("axios");
const sequelize = db.sequelize;
// const { Op } = require("sequelize");
const express = require("express");
const models = require("../models");
const {
  authenticate,
  authorizeAdmin,
  authorizeAdminOrAgent,
  authorizeAdminOrOrganization,
} = require("../controllers/auth");
class BaseController {
  constructor(model) {
    this.model = model;
    this.router = express.Router();
    this.validAttributesCache = new Set(Object.keys(this.model.rawAttributes));
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get("/list", this.listWithReferences.bind(this));
    this.router.get("/filterOrganization", this.filterOrganization.bind(this));
    this.router.get("/:id", this.read.bind(this));
    // this.router.post("/", this.create.bind(this));
    this.router.put("/:id", this.update.bind(this));
    this.router.put(
      "/jobCardStatus/:id",
      authenticate,
      authorizeAdminOrAgent,
      this.updateJobCardStatus.bind(this)
    );
    this.router.put(
      "/update/:id",
      authenticate,
      authorizeAdminOrOrganization,
      this.updateJobPost.bind(this)
    );
    this.router.delete("/:id", this.delete.bind(this));
    this.router.delete(
      "/deletedByAdmin/:id",
      authenticate,
      authorizeAdmin,
      this.delete.bind(this)
    );
  }

  listArgVerify(req, res, queryOptions) {
    throw "Method need to be implemented in child class";
  }

  async afterCreate(req, res, newObject, transaction) {
    throw "Method need to be implemented in child class";
  }

  async listWithReferences(req, res) {
    try {
      const { page = 1, limit } = req.query;
      const { user, attributes, include, where } = req.body;
      const pageValue = parseInt(page, 10);
      const limitValue = parseInt(limit, 10);
      const offset = (pageValue - 1) * limitValue;

      let validAttributes = attributes
        ? attributes.filter((attr) => this.validAttributesCache.has(attr))
        : null;
      if (validAttributes && validAttributes.length === 0) {
        return res
          .status(400)
          .json({ success: false, error: "No valid attributes provided" });
      }

      let queryWhere = {};
      if (where) {
        for (let key in where) {
          if (!this.validAttributesCache.has(key)) {
            return res.status(400).json({
              success: false,
              error: `Invalid attribute for filtering: ${key}`,
            });
          }
          queryWhere[key] = where[key];
        }
      }

      const modelAssociations = this.model.associations;
      for (const key in modelAssociations) {
        const association = modelAssociations[key];
        console.log(association);
      }

      let queryInclude = [];
      if (include) {
        include.forEach((inc) => {
          if (
            this.model.associations[inc] &&
            this.model.associations[inc].target
          ) {
            queryInclude.push({
              model: this.model.associations[inc].target,
              as: inc,
            });
          } else {
            return res.status(400).json({
              success: false,
              error: `Invalid include parameter: ${inc}`,
            });
          }
        });
      }

      const queryOptions = {
        attributes: validAttributes,
        where: queryWhere,
        include: queryInclude,
        limit: limitValue,
        offset: offset,
        order: [["id", "ASC"]],
      };
      this.listArgVerify(req, res, queryOptions);

      console.log(queryOptions);
      const results = await this.model.findAndCountAll(queryOptions);

      res.json({
        success: true,
        data: results.rows,
        total: results.count,
        totalPages: Math.ceil(results.count / limitValue),
        currentPage: pageValue,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async list(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      const results = await this.model.findAndCountAll({
        limit: limit,
        offset: offset,
        attributes: { exclude: ["password"] },
        order: [["id", "ASC"]],
      });

      res.json({
        success: true,
        data: results.rows,
        total: results.count,
        totalPages: Math.ceil(results.count / limit),
        currentPage: page,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async read(req, res) {
    try {
      const id = req.params.id;
      const item = await this.model.findByPk(id, {
        attributes: { exclude: ["password"] },
      });
      if (!item) {
        res.status(404).json({ success: false, error: "Item not found" });
      } else {
        res.json({ success: true, data: item });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async create(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const newData = req.body;

      const modelAssociations = this.model.associations;
      for (const key in modelAssociations) {
        const association = modelAssociations[key];
        if (association.associationType === "BelongsToMany") {
          const foreignKey = association.foreignKey;
          const associatedModel = association.target;
          const foreignKeyId = newData[foreignKey];
          if (foreignKeyId) {
            const associatedInstance = await associatedModel.findByPk(
              foreignKeyId,
              { transaction }
            );
            if (!associatedInstance) {
              throw new Error(
                `${associatedModel.name} with ID ${foreignKeyId} not found`
              );
            }
          }
        }
      }

      for (const key in modelAssociations) {
        const association = modelAssociations[key];
        if (association.associationType === "BelongsTo") {
          const foreignKey = association.foreignKey;
          const associatedModel = association.target;
          const foreignKeyId = newData[foreignKey];
          if (foreignKeyId) {
            const associatedInstance = await associatedModel.findByPk(
              foreignKeyId,
              { transaction }
            );
            if (!associatedInstance) {
              throw new Error(
                `${associatedModel.name} with ID ${foreignKeyId} not found`
              );
            }
            newData[foreignKey] = foreignKeyId;
          } else {
            throw new Error(
              `${associatedModel.name} with ID ${foreignKeyId} not found`
            );
          }
        }
      }

      const newItem = await this.model.create(newData, { transaction });

      await this.afterCreate(req, res, newItem, transaction);
      await transaction.commit();
      res.status(201).json(newItem);
    } catch (error) {
      await transaction.rollback();
      res.status(400).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = req.params.id;
      const [updated] = await this.model.update(req.body, {
        where: { id: id },
      });

      if (updated) {
        const updatedItem = await this.model.findByPk(id, {
          attributes: { exclude: ["password"] },
        });
        res.json(updatedItem);
      } else {
        res.status(404).json({ success: false, error: "Item not found" });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
  async updateJobPost(req, res) {
    let transaction;
    try {
      transaction = await sequelize.transaction();

      const { id } = req.params;
      const { jobCards, ...updatedJobPostData } = req.body;

      const jobPost = await this.model.findByPk(id, {
        include: [{ model: models.JobCard, as: "cards" }],
        transaction,
      });

      if (!jobPost) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ success: false, error: "JobPost not found" });
      }

      // Update the JobPost fields
      await jobPost.update(updatedJobPostData, { transaction });

      // Update existing JobCards with common fields
      await Promise.all(
        jobPost.cards.map(async (jobCard) => {
          await jobCard.update(
            {
              job_title: updatedJobPostData.job_title || jobCard.job_title,
              job_description:
                updatedJobPostData.job_description || jobCard.job_description,
              priority: updatedJobPostData.priority || jobCard.priority,
              due_date: updatedJobPostData.due_date || jobCard.due_date,
              status: updatedJobPostData.status || jobCard.status || "Open",
            },
            { transaction }
          );
        })
      );

      // If new jobCards are provided, append them to the existing jobCards
      if (jobCards && jobCards.length > 0) {
        const currentJobCards = jobPost.jobCards || [];
        const updatedJobCards = [...currentJobCards, ...jobCards];

        await jobPost.update({ jobCards: updatedJobCards }, { transaction });

        // Create new JobCard entries
        const newJobCardEntries = jobCards.map((jobCardData) => ({
          job_title: jobPost.job_title,
          job_description: jobPost.job_description,
          customerDetail: jobCardData,
          priority: jobPost.priority,
          due_date: jobPost.due_date,
          status: jobPost.status,
          JobPostId: id,
          OrganizationId: jobPost.OrganizationId,
          AdminId: jobPost.AdminId,
        }));

        await models.JobCard.bulkCreate(newJobCardEntries, { transaction });
      }

      await transaction.commit();

      // Fetch the updated JobPost with associated JobCards
      const finalUpdatedJobPost = await this.model.findByPk(id, {
        include: [
          {
            model: models.JobCard,
            as: "cards", // Make sure this alias matches your association
          },
        ],
      });

      res.status(200).json(finalUpdatedJobPost);
    } catch (error) {
      console.error("Error in updateJobPost:", error);
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      res.status(400).json({ error: error.message });
    }
  }
  async updateJobCardStatus(req, res) {
    try {
      const id = req.params.id; // JobCard ID
      const { status } = req.body;
      const userId = req.userId;
      const userType = req.userType;
      console.log(userId);
      console.log(userType);

      // Validate JobCard ID
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "JobCard ID is required" });
      }

      // Validate status
      if (!status || typeof status !== "string") {
        return res
          .status(400)
          .json({ success: false, error: "Valid status is required" });
      }

      // Fetch the JobCard
      const jobCard = await models.JobCard.findByPk(id);
      if (!jobCard) {
        return res
          .status(404)
          .json({ success: false, error: "JobCard not found" });
      }

      // Define allowed status updates based on user type
      const allowedStatusUpdates = {
        ADMIN: ["Open", "Ongoing", "Completed"],
        AGENT: ["Completed"],
      };

      // Check if the user is allowed to update to the requested status
      if (!allowedStatusUpdates[userType]?.includes(status)) {
        return res.status(403).json({
          success: false,
          error: `${userType} is not allowed to update status to ${status}`,
        });
      }

      // Validate status transition
      const validTransitions = {
        Open: ["Ongoing", "Completed"],
        Ongoing: ["Completed"],
        Completed: ["Open"],
      };

      if (!validTransitions[jobCard.status]?.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status transition from ${jobCard.status} to ${status}`,
        });
      }

      // Update the JobCard status
      jobCard.status = status;
      jobCard.lastUpdatedBy = userId;
      await jobCard.save();

      // Fetch the updated JobCard (excluding sensitive info)
      const updatedJobCard = await models.JobCard.findByPk(id, {
        attributes: { exclude: ["password"] },
      });

      res.json({
        success: true,
        message: "JobCard status updated successfully",
        data: updatedJobCard,
      });
    } catch (error) {
      console.error("Error updating JobCard status:", error);
      res
        .status(500)
        .json({
          success: false,
          error: `Internal server error ${error.message}`,
        });
    }
  }
  async filterOrganization(req, res) {
    try {
      const { page = 1, limit } = req.query;
      const { due_date, name } = req.query;
  
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
  
      // Validate due_date
      if (due_date) {
        if (isNaN(Date.parse(due_date))) {
          return res.status(400).json({ success: false, error: "Invalid due date format" });
        }
        order.push(['due_date', 'DESC']);
      }
  
      // Validate name
      if (name) {
        if (typeof name !== 'string' || name.trim() === '') {
          return res.status(400).json({ success: false, error: "Invalid name format" });
        }
        order.push(['name', 'DESC']);
      }
  
      // Add default ordering
      order.push(["createdAt", "DESC"]);
  
      // Define query options
      const queryOptions = {
        // where: whereClause,
        order: order,
        attributes: { exclude: ["password"] },
        limit: limitValue,
        offset: offset,
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
        const aMatch = (!due_date || a.due_date === due_date) && (!name || a.name === name);
        const bMatch = (!due_date || b.due_date === due_date) && (!name || b.name === name);
  
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
  
      // Apply pagination to the sorted results
      const paginatedResults = filteredAndSortedResults.slice(offset, offset + limitValue);
  
      res.status(200).json({
        success: true,
        data: paginatedResults,
        total: results.count,
        totalPages: Math.ceil(results.count / limitValue),
        currentPage: pageValue,
      });
    } catch (error) {
      console.error("Error in filterOrganization:", error);
      res.status(500).json({ success: false, error: `Internal server error: ${error.message}` });
    }
  }  
  
  async delete(req, res) {
    try {
      const id = req.params.id;
      const deleted = await this.model.destroy({
        where: { id: id },
      });

      if (deleted) {
        return res.status(200).json({ message: "item deleted" });
      } else {
        res.status(404).json({ success: false, error: "Item not found" });
      }
    } catch (error) {
      res.status(500).json({ success: true, error: error.message });
    }
  }

  static async proxyRequest(req, res, targetUrl) {
    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        params: req.query,
        data: req.body,
        headers: {
          "Content-Type": "application/json",
        },
      });

      res.status(response.status).send(response.data);
    } catch (error) {
      console.error("Error proxying request:", error.message);
      res
        .status(error.response ? error.response.status : 500)
        .send(error.message);
    }
  }
}

module.exports = BaseController;
