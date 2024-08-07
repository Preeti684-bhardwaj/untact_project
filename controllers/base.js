const db = require("../config/db.config.js");
const axios = require("axios");
const sequelize = db.sequelize;
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const express = require("express");
const models = require("../models");
const { isValidEmail, isValidPassword,matchesCriteria } = require("../utils/validation");
const sendEmail = require("../utils/sendEmail.js");
const {
  authenticate,
  authorizeAdmin,
  authorizeAdminOrAgent,
  authorizeAdminOrOrganization,
} = require("../controllers/auth");

const generateOtp = () => {
  // Define the possible characters for the OTP
  const chars = "0123456789";
  // Define the length of the OTP
  const len = 6;
  let otp = "";
  // Generate the OTP
  for (let i = 0; i < len; i++) {
    otp += chars[Math.floor(Math.random() * chars.length)];
  }

  this.otp = otp;
  this.otpExpire = Date.now() + 15 * 60 * 1000;

  return otp;
};

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
    this.router.post("/sendOtp", this.sendOtp.bind(this));
    this.router.post("/otpVerification", this.emailOtpVerification.bind(this));
    this.router.post("/forgotPassword", this.forgotPassword.bind(this));
    this.router.post("/resetpassword/:userId", this.resetPassword.bind(this));
    this.router.get("/getById/:id", this.read.bind(this));
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
  // send OTP
  async sendOtp(req, res) {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send({ success: false, message: "Missing Email" });
    }
    // Validate input fields
    if ([email].some((field) => field?.trim() === "")) {
      return res.status(400).send({
        success: false,
        message: "Please provide all necessary fields",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).send({ success: false, message: "Invalid Email" });
    }

    try {
      // Convert email to lowercase before querying
      const lowercaseEmail = email.toLowerCase().trim();
      const existing = await this.model.findOne({
        where: {
          email: lowercaseEmail,
        },
      });

      if (!existing) {
        return res
          .status(404)
          .send({ success: false, message: "Item not found" });
      }

      const otp = generateOtp();
      existing.otp = otp;
      existing.otpExpire = Date.now() + 15 * 60 * 1000;

      await existing.save({ validate: false });

      const message = `Your One Time Password (OTP) is ${otp}`;
      try {
        await sendEmail({
          email: existing.email,
          subject: `One-Time Password (OTP) for Verification`,
          message,
        });

        res.status(200).json({
          success: true,
          message: `OTP sent to ${existing.email} successfully`,
          email: existing.email,
          Id: existing.id,
        });
      } catch (emailError) {
        existing.otp = null;
        existing.otpExpire = null;
        await existing.save({ validate: false });

        console.error("Failed to send OTP email:", emailError);
        return res
          .status(500)
          .send({ success: false, message: emailError.message });
      }
    } catch (error) {
      return res.status(500).send({ success: false, message: error.message });
    }
  }
  //   Email OTP verification
  async emailOtpVerification(req, res) {
    const { email, otp } = req.body;

    // Validate the OTP
    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required." });
    }
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required." });
    }
    // Validate input fields
    if ([email, otp].some((field) => field?.trim() === "")) {
      return res.status(400).send({
        success: false,
        message: "Please provide all necessary fields",
      });
    }
    try {
      // Convert email to lowercase before querying
      const lowercaseEmail = email.toLowerCase().trim();
      const existing = await this.model.findOne({
        where: { email: lowercaseEmail },
      });
      console.log(existing);
      if (!existing) {
        return res.status(400).json({
          success: false,
          message: "Item not found or invalid details.",
        });
      }

      // Check OTP validity
      if (existing.otp !== otp) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
      }
      if (existing.otpExpire < Date.now()) {
        return res
          .status(400)
          .json({ success: false, message: "expired OTP." });
      }

      // Update organization details
      existing.isEmailVerified = true;
      existing.otp = null;
      existing.otpExpire = null;
      await existing.save();

      res.status(201).json({
        success: true,
        message: "Item data",
        data: {
          id: existing.id,
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          isEmailVerified: existing.isEmailVerified,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  }
  // async create(req, res) {
  //   const transaction = await sequelize.transaction();
  //   try {
  //     const newData = req.body;

  //     const modelAssociations = this.model.associations;
  //     for (const key in modelAssociations) {
  //       const association = modelAssociations[key];
  //       if (association.associationType === "BelongsToMany") {
  //         const foreignKey = association.foreignKey;
  //         const associatedModel = association.target;
  //         const foreignKeyId = newData[foreignKey];
  //         if (foreignKeyId) {
  //           const associatedInstance = await associatedModel.findByPk(
  //             foreignKeyId,
  //             { transaction }
  //           );
  //           if (!associatedInstance) {
  //             throw new Error(
  //               `${associatedModel.name} with ID ${foreignKeyId} not found`
  //             );
  //           }
  //         }
  //       }
  //     }

  //     for (const key in modelAssociations) {
  //       const association = modelAssociations[key];
  //       if (association.associationType === "BelongsTo") {
  //         const foreignKey = association.foreignKey;
  //         const associatedModel = association.target;
  //         const foreignKeyId = newData[foreignKey];
  //         if (foreignKeyId) {
  //           const associatedInstance = await associatedModel.findByPk(
  //             foreignKeyId,
  //             { transaction }
  //           );
  //           if (!associatedInstance) {
  //             throw new Error(
  //               `${associatedModel.name} with ID ${foreignKeyId} not found`
  //             );
  //           }
  //           newData[foreignKey] = foreignKeyId;
  //         } else {
  //           throw new Error(
  //             `${associatedModel.name} with ID ${foreignKeyId} not found`
  //           );
  //         }
  //       }
  //     }

  //     const newItem = await this.model.create(newData, { transaction });

  //     await this.afterCreate(req, res, newItem, transaction);
  //     await transaction.commit();
  //     res.status(201).json(newItem);
  //   } catch (error) {
  //     await transaction.rollback();
  //     res.status(400).json({ error: error.message });
  //   }
  // }

  // forget password
  async forgotPassword(req, res) {
    const { email } = req.body;

    // Validate input fields
    if (!email) {
      return res
        .status(400)
        .send({ success: false, message: "Missing email id" });
    }
    // Validate input fields
    if ([email].some((field) => field?.trim() === "")) {
      return res.status(400).send({
        success: false,
        message: "Please provide all necessary fields",
      });
    }

    if (!isValidEmail(email)) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid email address" });
    }

    try {
      // Find the organization by email
      const existing = await this.model.findOne({
        where: {
          email: email.toLowerCase().trim(),
        },
      });

      if (!existing) {
        return res
          .status(404)
          .send({ success: false, message: "Item not found" });
      }
      if (!existing.isEmailVerified) {
        return res
          .status(400)
          .send({ success: false, message: "Item is not verified" });
      }

      // Get ResetPassword Token
      const otp = generateOtp(); // Assuming you have a method to generate the OTP
      existing.otp = otp;
      existing.otpExpire = Date.now() + 15 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

      await existing.save({ validate: false });

      const message = `Your One Time Password is ${otp}`;

      await sendEmail({
        email: existing.email,
        subject: `Password Recovery`,
        message,
      });

      res.status(200).json({
        success: true,
        message: `OTP sent to ${existing.email} successfully`,
        Id: existing.id,
      });
    } catch (error) {
      existing.otp = null;
      existing.otpExpire = null;
      await existing.save({ validate: false });

      return res.status(500).send({ success: false, message: error.message });
    }
  }
  // reset password
  async resetPassword(req, res) {
    const { password, otp } = req.body;
    const id = req.params.userId;

    // Validate input fields
    if (!password || !otp) {
      return res.status(400).send({
        success: false,
        message: "Missing required fields: password or OTP",
      });
    }
    if (!id) {
      return res.status(400).send({
        success: false,
        message: "Missing Id in the params",
      });
    }
    // Validate input fields
    if ([password, otp].some((field) => field?.trim() === "")) {
      return res.status(400).send({
        success: false,
        message: "Please provide all necessary fields",
      });
    }
    const passwordValidationResult = isValidPassword(password);
    if (passwordValidationResult) {
      return res.status(400).send({
        success: false,
        message: passwordValidationResult,
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      // Find the organization by ID
      const existing = await this.model.findByPk(id);

      if (!existing) {
        return res
          .status(400)
          .send({ success: false, message: "Item not found" });
      }

      // Verify the OTP
      if (existing.otp !== otp.trim()) {
        return res.status(400).send({ success: false, message: "Invalid OTP" });
      }
      if (existing.otpExpire < Date.now()) {
        return res.status(400).send({ success: false, message: "expired OTP" });
      }

      // Update the organization's password and clear OTP fields
      existing.password = hashedPassword;
      existing.otp = null;
      existing.otpExpire = null;

      await existing.save({ validate: true });

      // Exclude password from the response
      const updatedOrganization = await this.model.findByPk(existing.id, {
        attributes: {
          exclude: ["password"],
        },
      });

      return res.status(200).json({
        success: true,
        message: `Password updated for ${updatedOrganization.email}`,
      });
    } catch (error) {
      return res.status(500).send({ success: false, message: error.message });
    }
  }
  // Update function
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
  // update JobPost (add new jobCard or update all existing jobCard attribute directly from jobpost)
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
  // update JobCard Status
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
      res.status(500).json({
        success: false,
        error: `Internal server error ${error.message}`,
      });
    }
  }
  // filter oraganization
  async filterOrganization(req, res) {
    try {
      const { name, priority, due_date, page = 1, limit = 10 } = req.query;
  
      // Validate pagination parameters
      const pageNumber = parseInt(page, 10);
      const limitNumber = parseInt(limit, 10);
      if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
        return res.status(400).json({ error: 'Invalid pagination parameters' });
      }
  
      // Calculate offset
      const offset = (pageNumber - 1) * limitNumber;
  
      // Base query
      let query = {
        include: [{
          model: models.JobPost,
          as: 'jobPosts',
          required: false, // Use left outer join
        }],
        limit: limitNumber,
        offset: offset,
        distinct: true, // Ensure correct count with associations
      };
  
      // Check if any filter is applied
      const isFilterApplied = name || priority || due_date;
  
      // Add filters if provided
      if (isFilterApplied) {
        if (name) {
          query.where = {
            ...query.where,
            name: {
              [Op.iLike]: `%${name}%`, // Case-insensitive partial match
            },
          };
        }
  
        if (priority || due_date) {
          query.include[0].where = {};
  
          if (priority) {
            query.include[0].where.priority = priority;
          }
  
          if (due_date) {
            // Validate due_date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
              return res.status(400).json({ error: 'Invalid due_date format. Use YYYY-MM-DD' });
            }
  
            query.include[0].where.due_date = {
              [Op.gte]: due_date, // Greater than or equal to the provided date
            };
          }
        }
      } else {
        // If no filters are applied, sort by creation date (newest first)
        query.order = [['createdAt', 'DESC']];
      }
  
      // Fetch organizations with count
      const { count, rows: organizations } = await models.Organization.findAndCountAll(query);
  
      let resultOrganizations = organizations;
  
      // Apply custom sorting only if filters are applied
      if (isFilterApplied) {
        resultOrganizations = organizations.sort((a, b) => {
          const aMatch = matchesCriteria(a, name, priority, due_date);
          const bMatch = matchesCriteria(b, name, priority, due_date);
  
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
          return a.name.localeCompare(b.name);
        });
      }
  
      // Prepare pagination metadata
      const totalPages = Math.ceil(count / limitNumber);
      const hasNextPage = pageNumber < totalPages;
      const hasPrevPage = pageNumber > 1;
  
      res.json({
        organizations: resultOrganizations,
        pagination: {
          currentPage: pageNumber,
          totalPages: totalPages,
          totalItems: count,
          itemsPerPage: limitNumber,
          hasNextPage: hasNextPage,
          hasPrevPage: hasPrevPage,
        }
      });
    } catch (error) {
      console.error('Error filtering organizations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  // delete function
  async delete(req, res) {
    try {
      const id = req.params.id;
      const deleted = await this.model.destroy({
        where: { id: id },
      });

      if (deleted) {
        return res.status(200).json({ success: true, message: "item deleted" });
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
