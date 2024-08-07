const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const BaseController = require("./base");
const models = require("../models");
const {
  isValidEmail,
  isValidPassword,
  isValidTimeString,
  parseTimeString,
  isValidLength,
  updateDailySlotAvailability,
} = require("../utils/validation");
const moment = require("moment");
const { Op } = require("sequelize");
const sequelize = require("../config/db.config").sequelize; // Ensure this path is correct
const { authenticate, authorizeAdmin } = require("../controllers/auth");

const generateToken = (agent) => {
  return jwt.sign({ obj: agent }, process.env.JWT_SECRET, {
    expiresIn: "72h", // expires in 72 hours
  });
};

class AgentController extends BaseController {
  constructor() {
    super(models.Agent);
    this.router.post(
      "/signup",
      authenticate,
      authorizeAdmin,
      this.signupByAdmin.bind(this)
    );
    this.router.post("/signupagent", this.signupByAgent.bind(this));
    this.router.post("/signin", this.signin.bind(this));
    this.router.get("/verify-email", this.verifyEmail.bind(this));
    this.router.put(
      "/updateAgentByAdmin/:id",
      authenticate,
      authorizeAdmin,
      this.updateAgentByAdmin.bind(this)
    );
    this.router.put("/updateByAgent/:id", this.updateByAgent.bind(this));
    this.router.get("/availability", this.getAgentAvailability.bind(this));
    this.router.post(
      "/assignJobCard/:jobPostId",
      this.assignJobCardToAgent.bind(this)
    );
    this.router.post("/removeJobCard", this.removeJobCardFromAgent.bind(this));
    this.router.get(
      "/jobCardCounts/:agentId",
      this.getAgentJobCardCounts.bind(this)
    );
  }

  listArgVerify(req, res, queryOptions) {
    const { role, active } = req.body;

    if (role) {
      queryOptions.where.role = role;
    }

    if (active !== undefined) {
      queryOptions.where.active = active;
    }

    if (queryOptions.attributes) {
      queryOptions.attributes = queryOptions.attributes.filter(
        (attr) => !["password", "resetToken"].includes(attr)
      );
    } else {
      queryOptions.attributes = { exclude: ["password", "resetToken"] };
    }

    return queryOptions;
  }

  async afterCreate(req, res, newObject, transaction) {
    // Add additional setup after creating an agent, if necessary
  }
  // signUp by agent
  signupByAgent = async (req, res) => {
    let transaction;
    try {
      transaction = await sequelize.transaction();
      const { name, email, phone, password } = req.body;

      // mandatory field check
      if (!name) {
        return res
          .status(400)
          .send({ success: false, message: "Name is required" });
      }
      if (!email) {
        return res
          .status(400)
          .send({ success: false, message: "Email is required" });
      }
      // if (!countryCode) {
      //   return res
      //     .status(400)
      //     .send({ success: false, message: "countryCode is required" });
      // }
      if (!phone) {
        return res
          .status(400)
          .send({ success: false, message: "Phone is required" });
      }
      if (!password) {
        return res
          .status(400)
          .send({ success: false, message: "Password is required" });
      }

      // Validate input fields
      if (
        [name, email, phone, password].some((field) => field?.trim() === "")
      ) {
        return res.status(400).send({
          success: false,
          message: "Please provide all necessary fields",
        });
      }
      const startTime = "09:00:00";
      const endTime = "18:00:00";

      if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
        await transaction.rollback();
        return res.status(400).send({
          success: false,
          message:
            "Invalid time format. Please provide times in HH:mm:ss format.",
        });
      }

      const startMoment = parseTimeString(startTime);
      const endMoment = parseTimeString(endTime);

      if (startMoment.isSameOrAfter(endMoment)) {
        await transaction.rollback();
        return res.status(400).send({
          success: false,
          message: "Start time must be before end time.",
        });
      }

      // Validate name
      const nameError = isValidLength(name);
      if (nameError) {
        return res.status(400).send({ success: false, message: nameError });
      }
      // const countryCodeError = isValidCountryCode(countryCode);
      // if (countryCodeError) {
      //   return res
      //     .status(400)
      //     .send({ success: false, message: countryCodeError });
      // }
      const phoneError = isPhoneValid(phone);
      if (phoneError) {
        return res.status(400).send({ success: false, message: phoneError });
      }

      if (!isValidEmail(email)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid email" });
      }
      const existingAgent = await models.Agent.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase().trim() }, { phone: phone }],
          },
        },
        { transaction }
      );

      if (existingAgent) {
        await transaction.rollback();
        if (
          existingAgent.email === email.toLowerCase().trim() &&
          existingAgent.phone === phone
        ) {
          return res.status(400).send({
            success: false,
            message: "Both email and phone number are already in use",
          });
        } else if (existingAgent.email === email.toLowerCase().trim()) {
          return res
            .status(400)
            .send({ success: false, message: "Email already in use" });
        } else {
          return res
            .status(400)
            .send({ success: false, message: "Phone number already in use" });
        }
      }
      const passwordValidationResult = isValidPassword(password);
      if (passwordValidationResult) {
        return res.status(400).send({
          success: false,
          message: passwordValidationResult,
        });
      }
      const hashedPassword = await bcrypt.hash(password, 10);

      // If no existing admin, create a new one
      const emailToken = generateToken({ email: email.toLowerCase().trim() });

      const newAgent = await models.Agent.create(
        {
          name,
          email: email.toLowerCase().trim(),
          phone,
          password: hashedPassword,
          emailToken,
          startTime: startTime,
          endTime: endTime,
        },
        { transaction }
      );
      // Convert to plain object and exclude password
      const agentResponse = newAgent.get({ plain: true });
      delete agentResponse.password;

      await transaction.commit();

      res.status(201).send({
        success: true,
        message: "Agent registered successfully",
        ...agentResponse,
      });
    } catch (error) {
      console.error("Signup error:", error);
      if (transaction) await transaction.rollback();
      res.status(500).send({
        success: false,
        message: "An error occurred during signup. Please try again later.",
      });
    }
  };
  //   signUp Agent by admin
  signupByAdmin = async (req, res) => {
    let transaction;
    try {
      transaction = await sequelize.transaction();
      const { name, email, phone, password, startTime, endTime } = req.body;

      // mandatory field check
      if (!name) {
        return res
          .status(400)
          .send({ success: false, message: "Name is required" });
      }
      if (!email) {
        return res
          .status(400)
          .send({ success: false, message: "Email is required" });
      }
      // if (!countryCode) {
      //   return res
      //     .status(400)
      //     .send({ success: false, message: "countryCode is required" });
      // }
      if (!phone) {
        return res
          .status(400)
          .send({ success: false, message: "Phone is required" });
      }
      if (!password) {
        return res
          .status(400)
          .send({ success: false, message: "Password is required" });
      }
      if (!startTime || !endTime) {
        return res.status(400).send({
          success: false,
          message: "Start time and end time are required",
        });
      }

      // Validate input fields
      if (
        [name, email, phone, password].some((field) => field?.trim() === "")
      ) {
        return res.status(400).send({
          success: false,
          message: "Please provide all necessary fields",
        });
      }
      if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) {
        await transaction.rollback();
        return res.status(400).send({
          success: false,
          message:
            "Invalid time format. Please provide times in HH:mm:ss format.",
        });
      }

      const startMoment = parseTimeString(startTime);
      const endMoment = parseTimeString(endTime);

      if (startMoment.isSameOrAfter(endMoment)) {
        await transaction.rollback();
        return res.status(400).send({
          success: false,
          message: "Start time must be before end time.",
        });
      }

      // Validate name
      const nameError = isValidLength(name);
      if (nameError) {
        return res.status(400).send({ success: false, message: nameError });
      }
      // const countryCodeError = isValidCountryCode(countryCode);
      // if (countryCodeError) {
      //   return res
      //     .status(400)
      //     .send({ success: false, message: countryCodeError });
      // }
      const phoneError = isPhoneValid(phone);
      if (phoneError) {
        return res.status(400).send({ success: false, message: phoneError });
      }

      if (!isValidEmail(email)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid email" });
      }

      const existingAgent = await models.Agent.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase().trim() }, { phone: phone }],
          },
        },
        { transaction }
      );

      if (existingAgent) {
        await transaction.rollback();
        if (
          existingAgent.email === email.toLowerCase().trim() &&
          existingAgent.phone === phone
        ) {
          return res.status(400).send({
            success: false,
            message: "Both email and phone number are already in use",
          });
        } else if (existingAgent.email === email.toLowerCase().trim()) {
          return res
            .status(400)
            .send({ success: false, message: "Email already in use" });
        } else {
          return res
            .status(400)
            .send({ success: false, message: "Phone number already in use" });
        }
      }
      const passwordValidationResult = isValidPassword(password);
      if (passwordValidationResult) {
        return res.status(400).send({
          success: false,
          message: passwordValidationResult,
        });
      }
      const hashedPassword = await bcrypt.hash(password, 10);

      // If no existing admin, create a new one
      const emailToken = generateToken({ email: email.toLowerCase().trim() });
      const newAgent = await models.Agent.create(
        {
          name,
          email: email.toLowerCase().trim(),
          phone,
          password: hashedPassword,
          emailToken,
          isEmailVerified: true,
          startTime,
          endTime,
        },
        { transaction }
      );

      // Convert to plain object and exclude password
      const agentResponse = newAgent.get({ plain: true });
      delete agentResponse.password;

      await transaction.commit();

      res.status(201).send({
        success: true,
        message: "Agent registered successfully",
        ...agentResponse,
      });
    } catch (error) {
      console.error("Signup error:", error);
      if (transaction) await transaction.rollback();
      res.status(500).send({
        success: false,
        message: "An error occurred during signup. Please try again later.",
      });
    }
  };
  // signIn Agent
  signin = async (req, res) => {
    const { email, password } = req.body;
    if ([email, password].some((field) => field?.trim() === "")) {
      return res.status(400).send({
        success: false,
        message: "Please provide all necessary fields",
      });
    }
    if (!email || !password) {
      return res
        .status(400)
        .send({ success: false, message: "Please Enter Email & Password" });
    }
    try {
      const agent = await models.Agent.findOne({
        where: { email: email.toLowerCase().trim() },
      });
      if (!agent) {
        return res
          .status(404)
          .send({ success: false, message: "Agent not found." });
      }
      if (!agent.isEmailVerified) {
        return res
          .status(400)
          .send({ success: false, message: "agent is not verified" });
      }

      const isPasswordValid = await bcrypt.compare(password, agent.password);
      if (!isPasswordValid) {
        return res
          .status(403)
          .send({ success: false, message: "Invalid password." });
      }

      const obj = {
        type: "AGENT",
        id: agent.id,
        email: agent.email,
      };

      const token = generateToken(obj);

      res.status(200).send({
        success: true,
        message: "Agent Login Successfully",
        id: agent.id,
        token: token,
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: error.message || "Some error occurred during signin.",
      });
    }
  };
  // verify Email (not in use)
  verifyEmail = async (req, res) => {
    const { token } = req.query;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const agent = await models.Agent.findByPk(decoded.obj.id);

      if (!agent) {
        return res.status(404).send({ message: "Agent not found." });
      }

      agent.isEmailVerified = true;
      await agent.save();

      res.status(200).send({ message: "Email verified successfully." });
    } catch (error) {
      res.status(500).send({
        message: error.message || "Could not verify email.",
      });
    }
  };
  // update Agent by admin
  updateAgentByAdmin = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const id = req.params.id;
      const { startTime, endTime, name, email, phone } = req.body;

      // Validate that no password is included in the request body
      if ("password" in req.body) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          error: "Password cannot be updated by Admin",
        });
      }

      // Initialize updateData object
      const updateData = {};

      // Validate and sanitize startTime and endTime
      if (startTime !== undefined || endTime !== undefined) {
        if (startTime !== undefined) {
          const trimmedStartTime = startTime.trim();
          if (trimmedStartTime === "") {
            await transaction.rollback();
            return res.status(400).send({
              success: false,
              message: "Start time cannot be empty or whitespace.",
            });
          }
          if (!isValidTimeString(trimmedStartTime)) {
            await transaction.rollback();
            return res.status(400).send({
              success: false,
              message:
                "Invalid start time format. Please provide time in HH:mm:ss format.",
            });
          }
          updateData.startTime = trimmedStartTime;
        }

        if (endTime !== undefined) {
          const trimmedEndTime = endTime.trim();
          if (trimmedEndTime === "") {
            await transaction.rollback();
            return res.status(400).send({
              success: false,
              message: "End time cannot be empty or whitespace.",
            });
          }
          if (!isValidTimeString(trimmedEndTime)) {
            await transaction.rollback();
            return res.status(400).send({
              success: false,
              message:
                "Invalid end time format. Please provide time in HH:mm:ss format.",
            });
          }
          updateData.endTime = trimmedEndTime;

          // Ensure startTime is before endTime
          if (
            updateData.startTime &&
            moment(updateData.startTime, "HH:mm:ss").isSameOrAfter(
              moment(updateData.endTime, "HH:mm:ss")
            )
          ) {
            await transaction.rollback();
            return res.status(400).send({
              success: false,
              message: "Start time must be before end time.",
            });
          }
        }
      }

      // Validate and sanitize name
      if (name !== undefined) {
        const trimmedName = name.trim();
        if (trimmedName === "") {
          await transaction.rollback();
          return res.status(400).send({
            success: false,
            message: "Name cannot be empty or whitespace.",
          });
        }
        const nameError = isValidLength(trimmedName);
        if (nameError) {
          await transaction.rollback();
          return res.status(400).send({ success: false, message: nameError });
        }
        updateData.name = trimmedName;
      }

      // Validate and sanitize email
      if (email !== undefined) {
        const trimmedEmail = email.trim();
        if (trimmedEmail === "") {
          await transaction.rollback();
          return res.status(400).send({
            success: false,
            message: "Email cannot be empty or whitespace.",
          });
        }
        if (!isValidEmail(trimmedEmail)) {
          await transaction.rollback();
          return res
            .status(400)
            .send({ success: false, message: "Invalid email" });
        }

        // Check if the email already exists in the database
        const emailExists = await models.Agent.findOne({
          where: { email: trimmedEmail, id: { [Op.ne]: id } },
        });
        if (emailExists) {
          await transaction.rollback();
          return res.status(400).send({
            success: false,
            message: "Email already exists",
          });
        }

        updateData.email = trimmedEmail;
      }

      // Validate and sanitize phone
      if (phone !== undefined) {
        const trimmedPhone = phone.trim();
        if (trimmedPhone === "") {
          await transaction.rollback();
          return res.status(400).send({
            success: false,
            message: "Phone number cannot be empty or whitespace.",
          });
        }
        const phoneError = isPhoneValid(trimmedPhone);
        if (phoneError) {
          return res.status(400).send({ success: false, message: phoneError });
        }
  

        // Check if the phone number already exists in the database
        const phoneExists = await models.Agent.findOne({
          where: { phone: trimmedPhone, id: { [Op.ne]: id } },
        });
        if (phoneExists) {
          await transaction.rollback();
          return res.status(400).send({
            success: false,
            message: "Phone number already exists",
          });
        }

        updateData.phone = trimmedPhone;
      }

      // Perform the update operation only if there are fields to update
      if (Object.keys(updateData).length === 0) {
        await transaction.rollback();
        return res
          .status(400)
          .json({
            success: false,
            error: "No valid fields provided for update.",
          });
      }

      const [updatedRows] = await models.Agent.update(updateData, {
        where: { id: id },
        transaction,
      });

      if (updatedRows > 0) {
        await transaction.commit();
        const updatedItem = await models.Agent.findByPk(id, {
          attributes: { exclude: ["password"] },
        });
        return res.json({
          success: true,
          message: "Updated successfully by admin",
          data: updatedItem,
        });
      } else {
        await transaction.rollback();
        return res
          .status(404)
          .json({ success: false, error: "Agent not found" });
      }
    } catch (error) {
      await transaction.rollback();
      return res.status(500).json({ success: false, error: error.message });
    }
  };
  // update By Agent
  updateByAgent = async (req, res) => {
    try {
      const id = req.params.id;
      const { name } = req.body;

      // Check if only name is provided
      if (
        Object.keys(req.body).length !== 1 ||
        !req.body.hasOwnProperty("name")
      ) {
        return res
          .status(400)
          .json({ success: false, error: "Only name field can be updated" });
      }
      // mandatory field check
      if (!name) {
        return res
          .status(400)
          .send({ success: false, message: "Name is required" });
      }
      // Validate input fields
      if ([name].some((field) => field?.trim() === "")) {
        return res.status(400).send({
          success: false,
          message: "Please provide all necessary fields",
        });
      }
      // Validate name
      const nameError = isValidLength(name);
      if (nameError) {
        return res.status(400).send({ success: false, message: nameError });
      }
      const [updated] = await models.Agent.update(
        { name: name.trim() },
        {
          where: { id: id },
        }
      );

      if (updated) {
        const updatedItem = await models.Agent.findByPk(id, {
          attributes: { exclude: ["password"] },
        });

        if (!updatedItem) {
          return res
            .status(404)
            .json({ success: false, error: "Item not found after update" });
        }

        res.json({
          success: true,
          message: "updated successfully by agent",
          data: updatedItem,
        });
      } else {
        res.status(404).json({ success: false, error: "Item not found" });
      }
    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({
        success: false,
        error: "An error occurred while updating the item",
      });
    }
  };
  // agent availability
  getAgentAvailability = async (req, res) => {
    try {
      const { jobPostId, agentId, date } = req.query;

      // Validate input
      if (!agentId || !jobPostId || !date) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // Validate date format
      if (!moment(date, "YYYY-MM-DD", true).isValid()) {
        return res
          .status(400)
          .json({ error: "Invalid date format. Use YYYY-MM-DD" });
      }

      // Fetch agent and job post
      const [agent, jobPost] = await Promise.all([
        models.Agent.findByPk(agentId),
        models.JobPost.findByPk(jobPostId),
      ]);

      if (!agent || !jobPost) {
        return res.status(404).json({ error: "Agent or JobPost not found" });
      }

      // Check if DailySlot already exists
      let dailySlot = await models.DailySlot.findOne({
        where: { agentId, date, JobPostId: jobPostId },
      });

      if (dailySlot) {
        return res.json(dailySlot.slots);
      }

      // Calculate mini slot duration
      const averageTimePerJobCard = jobPost.averageTime || 6; // default to 6 minutes if not set
      const miniSlotDuration = Math.max(
        6,
        Math.ceil(averageTimePerJobCard / 6) * 6
      ); // Round up to nearest multiple of 6

      // Parse agent's working hours
      const startTime = agent.startTime; // e.g., "09:00:00"
      const endTime = agent.endTime; // e.g., "18:00:00"

      // Combine date with time to create start and end Date objects in UTC
      const agentStartTime = moment.utc(`${date}T${startTime}`);
      const agentEndTime = moment.utc(`${date}T${endTime}`);

      // Generate slots
      const slots = [];
      let currentSlotStart = agentStartTime.clone();

      while (currentSlotStart.isBefore(agentEndTime)) {
        const slotEnd = moment.min(
          currentSlotStart.clone().add(1, "hour"),
          agentEndTime
        );

        const miniSlots = [];
        let currentMiniSlotStart = currentSlotStart.clone();

        while (currentMiniSlotStart.isBefore(slotEnd)) {
          const miniSlotEnd = moment.min(
            currentMiniSlotStart.clone().add(miniSlotDuration, "minutes"),
            slotEnd
          );

          miniSlots.push({
            start: currentMiniSlotStart.toISOString(),
            end: miniSlotEnd.toISOString(),
          });

          currentMiniSlotStart = miniSlotEnd;
        }

        slots.push({
          slot: {
            start: currentSlotStart.toISOString(),
            end: slotEnd.toISOString(),
          },
          availableMiniSlots: miniSlots,
        });

        currentSlotStart = slotEnd;
      }

      // Filter out occupied slots
      let occupiedSlots = [];

      if (agent.jobs && Array.isArray(agent.jobs)) {
        occupiedSlots = agent.jobs.filter(
          (job) =>
            moment(job.startTime).isSame(date, "day") ||
            moment(job.endTime).isSame(date, "day")
        );
      } else if (agent.jobs) {
        console.warn(`Unexpected format for agent.jobs: ${typeof agent.jobs}`);
      }

      // If there are no occupied slots, all slots are available
      if (occupiedSlots.length === 0) {
        // No need to filter slots, they're all available
        // You might want to log this for debugging
        console.log(`No occupied slots for agent ${agentId} on ${date}`);
      }

      // The rest of your slot filtering logic...
      slots.forEach((slot) => {
        if (occupiedSlots.length > 0) {
          slot.availableMiniSlots = slot.availableMiniSlots.filter(
            (miniSlot) =>
              !occupiedSlots.some(
                (job) =>
                  moment(job.startTime).isBetween(
                    miniSlot.start,
                    miniSlot.end,
                    null,
                    "[)"
                  ) ||
                  moment(job.endTime).isBetween(
                    miniSlot.start,
                    miniSlot.end,
                    null,
                    "(]"
                  )
              )
          );
        }
        // If occupiedSlots is empty, all miniSlots remain available
      });

      // Create new DailySlot
      dailySlot = await models.DailySlot.create({
        agentId,
        JobPostId: jobPostId,
        date,
        slots,
      });

      // Calculate count of available mini slots
      const availableMiniSlotsCount = slots.reduce(
        (count, { availableMiniSlots }) => count + availableMiniSlots.length,
        0
      );

      // Update the agent's availableSlots field with the count
      await models.Agent.update(
        { availableSlots: availableMiniSlotsCount },
        { where: { id: agentId } }
      );

      res.json(slots);
    } catch (error) {
      console.error("Error in getAgentAvailability:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  // assigning JobCard To Agent
  assignJobCardToAgent = async (req, res) => {
    try {
      const { jobCards, agentId, selectedSlots } = req.body;
      const { jobPostId } = req.params;

      // Validation checks
      if (!jobCards || !Array.isArray(jobCards) || jobCards.length === 0) {
        return res
          .status(400)
          .json({ error: "Invalid or empty jobCards array" });
      }
      if (!agentId) {
        return res.status(400).json({ error: "AgentId is required" });
      }
      if (
        !selectedSlots ||
        !Array.isArray(selectedSlots) ||
        selectedSlots.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "Invalid or empty selectedSlots array" });
      }
      if (!jobPostId) {
        return res.status(400).json({ error: "JobPostId is required" });
      }

      const agent = await models.Agent.findByPk(agentId);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const jobPost = await models.JobPost.findByPk(jobPostId);
      if (!jobPost) {
        return res.status(404).json({ error: "Associated JobPost not found" });
      }

      // Ensure the number of job cards matches the number of selected slots
      if (jobCards.length !== selectedSlots.length) {
        return res.status(400).json({
          error: "Number of job cards must match the number of selected slots",
        });
      }

      // Fetch all JobCard records at once
      const jobCardIds = jobCards.map((jc) => jc.id);
      const jobCardRecords = await models.JobCard.findAll({
        where: { id: jobCardIds },
      });

      if (jobCardRecords.length !== jobCards.length) {
        return res.status(404).json({ error: "Some JobCards were not found" });
      }

      // Validate slots and check for conflicts
      const currentJobs = agent.jobs || [];
      const newJobs = [];

      for (let i = 0; i < jobCards.length; i++) {
        const jobCard = jobCardRecords.find((jc) => jc.id === jobCards[i].id);
        const slot = selectedSlots[i];
        console.log(slot);
        console.log(jobCard);
        // Validate slot times
        if (!slot.start || !slot.end) {
          return res
            .status(400)
            .json({ error: `Invalid slot times for slot ${i}` });
        }

        const startTime = new Date(slot.start);
        const endTime = new Date(slot.end);

        if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
          return res
            .status(400)
            .json({ error: `Invalid slot times for slot ${i}` });
        }

        // Check for conflicts with existing jobs
        const hasConflict = currentJobs.some((job) => {
          const jobStart = new Date(job.startTime);
          const jobEnd = new Date(job.endTime);
          return startTime < jobEnd && endTime > jobStart;
        });

        if (hasConflict) {
          return res
            .status(409)
            .json({ error: `Slot conflict for job card ${jobCard.id}` });
        }

        // Prepare new job entry
        newJobs.push({
          jobCardId: jobCard.id,
          jobPostId: jobPostId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: "Scheduled",
        });

        // Update JobCard
        await jobCard.update({
          status: "Ongoing",
          lastUpdatedByAgent: agentId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isAssigned: true,
        });
      }

      // Update agent's jobs and jobInHand
      const updatedJobs = [...currentJobs, ...newJobs];
      await agent.update({
        jobs: updatedJobs,
        jobInHand: updatedJobs.length,
      });

      // Update DailySlot to mark selected slots as unavailable
      // Fetch the current DailySlot
      // console.log('Selected slot startTime:', selectedSlots[0].startTime);
      // const date = new Date(selectedSlots[0].startTime)
      //   .toISOString()
      //   .split("T")[0];
      const dailySlot = await models.DailySlot.findOne({
        where: { agentId: agentId },
      });

      if (!dailySlot) {
        return res
          .status(404)
          .json({ error: `DailySlot of agent ${agentId} not found` });
      }

      // Update DailySlot to mark selected slots as unavailable
      const updatedSlots = updateDailySlotAvailability(
        dailySlot.slots,
        selectedSlots
      );
      await dailySlot.update({ slots: updatedSlots });

      return res.status(200).json({
        message: "Job cards assigned successfully",
        assignedJobs: newJobs,
      });
    } catch (error) {
      console.error("Error in assignJobCardToAgent:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
  // removing jobCard From agent
  removeJobCardFromAgent = async (req, res) => {
    try {
      const { jobCardId, agentId } = req.body;

      if (!jobCardId || !agentId) {
        return res
          .status(400)
          .json({ error: "JobCard ID and Agent ID are required" });
      }

      const jobCard = await models.JobCard.findByPk(jobCardId);
      const agent = await models.Agent.findByPk(agentId);
      if (!jobCard || !agent) {
        return res.status(404).json({ error: "JobCard or Agent not found" });
      }

      const assignment = await models.Assignment.findOne({
        where: {
          JobCardId: jobCardId,
          AgentId: agentId,
          status: { [Op.ne]: "Completed" },
        },
      });

      if (!assignment) {
        return res.status(400).json({
          error: "This job card is not assigned to the specified agent",
        });
      }

      await assignment.destroy();

      jobCard.status = "Open";
      jobCard.lastUpdatedBy = null;
      await jobCard.save();

      agent.jobInHand -= 1;
      await agent.save();

      return res.status(200).json({ message: "Job card removed successfully" });
    } catch (error) {
      console.error("Error in removeJobCardFromAgent:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
  // get agent JobCard count
  getAgentJobCardCounts = async (req, res) => {
    try {
      const { agentId } = req.params;
      const agent = await models.Agent.findByPk(agentId);
      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }
      const totalJobCards = await models.JobCard.count();
      const assignedJobCards = await models.Assignment.count({
        where: { AgentId: agentId },
      });
      res.status(200).json({
        totalJobCards,
        assignedJobCards,
        remainingJobCards: totalJobCards - assignedJobCards,
      });
    } catch (error) {
      console.error("Error in getAgentJobCardCounts:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

module.exports = new AgentController();
