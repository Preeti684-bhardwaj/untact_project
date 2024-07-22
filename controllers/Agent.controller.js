const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const BaseController = require("./base");
const models = require("../models");
const {
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidLength,
} = require("../utils/validation");
const moment = require("moment");
const sendEmail = require("../utils/sendEmail.js");
const { Op } = require("sequelize");
const sequelize = require("../config/db.config").sequelize; // Ensure this path is correct
const { authenticate, authorizeAdmin } = require("../controllers/auth");

const generateToken = (agent) => {
  return jwt.sign({ obj: agent }, process.env.JWT_SECRET, {
    expiresIn: "72h", // expires in 72 hours
  });
};
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
    this.router.post("/forgotPassword", this.forgotPassword.bind(this));
    this.router.post("/resetpassword/:agentId", this.resetPassword.bind(this));
    this.router.post("/sendOtp", this.sendOtp.bind(this));
    this.router.post("/otpVerification", this.emailOtpVerification.bind(this));
    this.router.put(
      "/updateAgentByAdmin/:id",
      authenticate,
      authorizeAdmin,
      this.updateAgentByAdmin.bind(this)
    );
    this.router.put("/updateByAgent/:id", this.updateByAgent.bind(this));
    this.router.get("/availability", this.getAgentAvailability.bind(this));
    this.router.post("/assignJobCard", this.assignJobCardToAgent.bind(this));
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

  signupByAgent = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
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
      if (startTime === undefined || endTime === undefined) {
        return res.status(400).send({
          success: false,
          message: "Start time and end time are required",
        });
      }

      if (
        !Number.isInteger(startTime) ||
        !Number.isInteger(endTime) ||
        startTime < 0 ||
        startTime > 23 ||
        endTime < 0 ||
        endTime > 23 ||
        startTime >= endTime
      ) {
        return res.status(400).send({
          success: false,
          message:
            "Invalid start time or end time. Must be integers between 0 and 23, and start time must be before end time.",
        });
      }
      // Validate name
      const nameError = isValidLength(name);
      if (nameError) {
        return res.status(400).send({ success: false, message: nameError });
      }

      if (!isValidPhone(phone)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid Phone Number" });
      }

      if (!isValidEmail(email)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid email" });
      }
      const existingAgent = await models.Agent.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase() }, { phone: phone }],
          },
        },
        { transaction }
      );

      if (existingAgent) {
        await transaction.rollback();
        if (
          existingAgent.email.toLowerCase() === email.toLowerCase() &&
          existingAgent.phone === phone
        ) {
          return res.status(400).send({
            success: false,
            message: "Both email and phone number are already in use",
          });
        } else if (existingAgent.email.toLowerCase() === email.toLowerCase()) {
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
      const emailToken = generateToken({ email: email.toLowerCase() });

      const newAgent = await models.Agent.create(
        {
          name,
          email: email.toLowerCase(),
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

  //   sign up by admin
  signupByAdmin = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
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
      if (startTime === undefined || endTime === undefined) {
        return res.status(400).send({
          success: false,
          message: "Start time and end time are required",
        });
      }

      if (
        !Number.isInteger(startTime) ||
        !Number.isInteger(endTime) ||
        startTime < 0 ||
        startTime > 23 ||
        endTime < 0 ||
        endTime > 23 ||
        startTime >= endTime
      ) {
        return res.status(400).send({
          success: false,
          message:
            "Invalid start time or end time. Must be integers between 0 and 23, and start time must be before end time.",
        });
      }
      // Validate name
      const nameError = isValidLength(name);
      if (nameError) {
        return res.status(400).send({ success: false, message: nameError });
      }

      if (!isValidEmail(email)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid email" });
      }

      if (!isValidPhone(phone)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid Phone Number" });
      }

      const existingAgent = await models.Agent.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase() }, { phone: phone }],
          },
        },
        { transaction }
      );

      if (existingAgent) {
        await transaction.rollback();
        if (
          existingAgent.email.toLowerCase() === email.toLowerCase() &&
          existingAgent.phone === phone
        ) {
          return res.status(400).send({
            success: false,
            message: "Both email and phone number are already in use",
          });
        } else if (existingAgent.email.toLowerCase() === email.toLowerCase()) {
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
      const emailToken = generateToken({ email: email.toLowerCase() });

      const newAgent = await models.Agent.create(
        {
          name,
          email: email.toLowerCase(),
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

  //   Email OTP verification
  emailOtpVerification = async (req, res) => {
    const { email, otp } = req.body;
    // Validate the Email
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required." });
    }
    // Validate the OTP
    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required." });
    }

    try {
      // Convert email to lowercase before querying
      const lowercaseEmail = email.toLowerCase().trim();
      const agent = await models.Agent.findOne({
        where: { email: lowercaseEmail },
      });
      console.log(agent);
      if (!agent) {
        return res.status(400).json({
          success: false,
          message: "Agent not found or invalid details.",
        });
      }

      // Check OTP validity
      if (agent.otp !== otp) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
      }
      if (agent.otpExpire < Date.now()) {
        return res
          .status(400)
          .json({ success: false, message: "expired OTP." });
      }

      // Update agent details
      agent.isEmailVerified = true;
      agent.otp = null;
      agent.otpExpire = null;
      await agent.save();

      res.status(201).json({
        success: true,
        message: "Agent data",
        agent: {
          id: agent.id,
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
          isEmailVerified: agent.isEmailVerified,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message,
      });
    }
  };

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
        where: { email: email.trim() },
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

  // forget password
  forgotPassword = async (req, res) => {
    const { email } = req.body;

    // Validate input fields
    if (!email) {
      return res
        .status(400)
        .send({ success: false, message: "Missing email id" });
    }

    if (!isValidEmail(email)) {
      return res
        .status(400)
        .send({ success: false, message: "Invalid email address" });
    }

    try {
      // Find the agent by email
      const agent = await models.Agent.findOne({
        where: {
          email: email.trim(),
        },
      });

      if (!agent) {
        return res
          .status(404)
          .send({ success: false, message: "Agent not found" });
      }
      if (!agent.isEmailVerified) {
        return res
          .status(400)
          .send({ success: false, message: "Agent is not verified" });
      }

      // Get ResetPassword Token
      const otp = generateOtp(); // Assuming you have a method to generate the OTP
      agent.otp = otp;
      agent.otpExpire = Date.now() + 15 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

      await agent.save({ validate: false });

      const message = `Your One Time Password is ${otp}`;

      await sendEmail({
        email: agent.email,
        subject: `Password Recovery`,
        message,
      });

      res.status(200).json({
        success: true,
        message: `OTP sent to ${agent.email} successfully`,
        agentId: agent.id,
      });
    } catch (error) {
      agent.otp = null;
      agent.otpExpire = null;
      await agent.save({ validate: false });

      return res.status(500).send({ success: false, message: error.message });
    }
  };

  // reset password
  resetPassword = async (req, res) => {
    const { password, otp } = req.body;
    const agentId = req.params.agentId;

    // Validate input fields
    if (!password || !otp) {
      return res.status(400).send({
        success: false,
        message: "Missing required fields: password or OTP",
      });
    }
    if (!agentId) {
      return res
        .status(400)
        .send({ success: false, message: "Missing AgentId in the params" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      // Find the agent by ID
      const agent = await models.Agent.findByPk(agentId);

      if (!agent) {
        return res
          .status(400)
          .send({ success: false, message: "Agent not found" });
      }

      // Verify the OTP
      if (agent.otp !== otp.trim()) {
        return res.status(400).send({ success: false, message: "Invalid OTP" });
      }
      if (agent.otpExpire < Date.now()) {
        return res.status(400).send({ success: false, message: "expired OTP" });
      }

      // Update the agent's password and clear OTP fields
      agent.password = hashedPassword;
      agent.otp = null;
      agent.otpExpire = null;

      await agent.save({ validate: true });

      // Exclude password from the response
      const updatedAgent = await models.Agent.findByPk(agent.id, {
        attributes: {
          exclude: ["password"],
        },
      });

      return res.status(200).json({
        success: true,
        message: `Password updated for ${updatedAgent.email}`,
      });
    } catch (error) {
      return res.status(500).send({ success: false, message: error.message });
    }
  };

  // send OTP
  sendOtp = async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).send({ success: false, message: "Missing Email" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).send({ message: "Invalid Email" });
    }

    try {
      // Convert email to lowercase before querying
      const lowercaseEmail = email.toLowerCase().trim();
      const agent = await models.Agent.findOne({
        where: {
          email: lowercaseEmail,
        },
      });

      if (!agent) {
        return res
          .status(404)
          .send({ success: false, message: "Agent not found" });
      }

      const otp = generateOtp();
      agent.otp = otp;
      agent.otpExpire = Date.now() + 15 * 60 * 1000;

      await agent.save({ validate: false });

      const message = `Your One Time Password (OTP) is ${otp}`;
      try {
        await sendEmail({
          email: agent.email,
          subject: `One-Time Password (OTP) for Verification`,
          message,
        });

        res.status(200).json({
          success: true,
          message: `OTP sent to ${agent.email} successfully`,
          email: agent.email,
          agentId: agent.id,
        });
      } catch (emailError) {
        agent.otp = null;
        agent.otpExpire = null;
        await agent.save({ validate: false });

        console.error("Failed to send OTP email:", emailError);
        return res
          .status(500)
          .send({ success: false, message: emailError.message });
      }
    } catch (error) {
      return res.status(500).send({ success: false, message: error.message });
    }
  };
  updateAgentByAdmin = async (req, res) => {
    try {
      const id = req.params.id;
      const { startTime, endTime, ...otherFields } = req.body;

      if ("password" in otherFields) {
        return res.status(400).json({
          success: false,
          error: "Password cannot be updated by Admin",
        });
      }

      if (startTime !== undefined || endTime !== undefined) {
        if (
          !Number.isInteger(startTime) ||
          !Number.isInteger(endTime) ||
          startTime < 0 ||
          startTime > 23 ||
          endTime < 0 ||
          endTime > 23 ||
          startTime >= endTime
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Invalid start time or end time. Must be integers between 0 and 23, and start time must be before end time.",
          });
        }
      }

      const [updatedRows] = await this.model.update(
        { ...otherFields, startTime, endTime },
        {
          where: { id: id },
        }
      );

      if (updatedRows > 0) {
        const updatedItem = await this.model.findByPk(id, {
          attributes: { exclude: ["password"] },
        });
        res.json({
          success: true,
          message: "updated successfully by admin",
          data: updatedItem,
        });
      } else {
        res.status(404).json({ success: false, error: "Item not found" });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };
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
      const { agentId, date } = req.query;

      if (!agentId || !date) {
        return res.status(400).send({
          success: false,
          message: "Agent ID and date are required",
        });
      }
      // Parse and validate the date
      const parsedDate = moment(date, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
      if (!parsedDate.isValid()) {
        return res.status(400).send({
          success: false,
          message: "Invalid date format. Please use DD-MM-YYYY.",
        });
      }

      const agent = await models.Agent.findByPk(agentId);
      if (!agent) {
        return res.status(404).send({
          success: false,
          message: "Agent not found",
        });
      }

      const startOfDay = parsedDate.startOf("day");
      const endOfDay = parsedDate.endOf("day");

      const assignments = await models.Assignment.findAll({
        where: {
          AgentId: agentId,
          startTime: {
            [Op.between]: [startOfDay.toDate(), endOfDay.toDate()],
          },
        },
        order: [["startTime", "ASC"]],
      });

      const availabilitySlots = [];
      let currentTime = moment(startOfDay).hour(agent.startTime);
      const dayEndTime = moment(startOfDay).hour(agent.endTime);

      while (currentTime.isBefore(dayEndTime)) {
        const slotEnd = moment.min(
          currentTime.clone().add(1, "hour"),
          dayEndTime
        );

        const conflictingAssignments = assignments.filter(
          (assignment) =>
            moment(assignment.startTime).isBefore(slotEnd.toDate()) &&
            moment(assignment.endTime).isAfter(currentTime.toDate())
        );

        if (conflictingAssignments.length === 0) {
          availabilitySlots.push({
            startTime: currentTime.toDate(),
            endTime: slotEnd.toDate(),
            available: true,
            duration: slotEnd.diff(currentTime, "minutes"),
          });
        } else {
          // Handle partial availability within the hour
          let availableStart = currentTime.clone();
          conflictingAssignments.forEach((assignment) => {
            if (moment(assignment.startTime).isAfter(availableStart)) {
              availabilitySlots.push({
                startTime: availableStart.toDate(),
                endTime: moment(assignment.startTime).toDate(),
                available: true,
                duration: moment(assignment.startTime).diff(
                  availableStart,
                  "minutes"
                ),
              });
            }
            availableStart = moment.max(
              availableStart,
              moment(assignment.endTime)
            );
          });

          if (availableStart.isBefore(slotEnd)) {
            availabilitySlots.push({
              startTime: currentTime.toDate(),
              endTime: slotEnd.toDate(),
              available: true,
              duration: slotEnd.diff(currentTime, "minutes"),
              selected: false,
            });
          }
        }

        currentTime = slotEnd;
      }

      res.status(200).send({
        success: true,
        data: availabilitySlots,
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message:
          error.message ||
          "An error occurred while fetching agent availability.",
      });
    }
  };
  assignJobCardToAgent = async (req, res) => {
    try {
      const { jobCardId, agentId, selectedSlots } = req.body;
  
      if (!jobCardId || !agentId || !selectedSlots || !Array.isArray(selectedSlots) || selectedSlots.length === 0) {
        return res.status(400).json({ error: "JobCard ID, Agent ID, and selected slots are required and selected slots must be an array" });
      }
  
      const jobCard = await models.JobCard.findByPk(jobCardId);
      const agent = await models.Agent.findByPk(agentId);
      if (!jobCard || !agent) {
        return res.status(404).json({ error: "JobCard or Agent not found" });
      }
  
      const jobPost = await models.JobPost.findByPk(jobCard.JobPostId);
      if (!jobPost) {
        return res.status(404).json({ error: "Associated JobPost not found" });
      }
  
      // Sort selected slots by start time
      const sortedSlots = selectedSlots.sort((a, b) => moment(a.startTime).diff(moment(b.startTime)));
  
      // Check if slots are within working hours
      const workStartTime = moment(sortedSlots[0].startTime).startOf("day").add(agent.startTime, "hours");
      const workEndTime = moment(sortedSlots[0].startTime).startOf("day").add(agent.endTime, "hours");
  
      if (moment(sortedSlots[0].startTime).isBefore(workStartTime) || 
          moment(sortedSlots[sortedSlots.length - 1].endTime).isAfter(workEndTime)) {
        return res.status(400).json({
          error: "The assignment is outside of the agent's working hours",
        });
      }
  
      // Merge consecutive or overlapping slots
      const mergedSlots = [];
      let currentSlot = sortedSlots[0];
  
      for (let i = 1; i < sortedSlots.length; i++) {
        if (moment(sortedSlots[i].startTime).diff(moment(currentSlot.endTime), 'minutes') <= 5) {
          // Merge overlapping or adjacent slots
          currentSlot.endTime = moment.max(moment(currentSlot.endTime), moment(sortedSlots[i].endTime)).toDate();
        } else {
          mergedSlots.push(currentSlot);
          currentSlot = sortedSlots[i];
        }
      }
      mergedSlots.push(currentSlot); // Add the last slot
  
      // Check for conflicting assignments
      for (const slot of mergedSlots) {
        const conflictingAssignments = await models.Assignment.findAll({
          where: {
            AgentId: agentId,
            [Op.or]: [
              {
                startTime: { [Op.lt]: moment(slot.endTime).toDate() },
                endTime: { [Op.gt]: moment(slot.startTime).toDate() },
              },
              {
                startTime: { [Op.between]: [slot.startTime, moment(slot.endTime).toDate()] },
              },
              {
                endTime: { [Op.between]: [slot.startTime, moment(slot.endTime).toDate()] },
              },
            ],
          },
        });
  
        if (conflictingAssignments.length > 0) {
          return res.status(400).json({ error: "There are conflicting assignments for the selected time slots" });
        }
      }
  
      // Create assignments for each merged slot
      const createdAssignments = [];
      for (const slot of mergedSlots) {
        const assignment = await models.Assignment.create({
          AgentId: agentId,
          JobCardId: jobCardId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: "Scheduled",
        });
        createdAssignments.push(assignment);
      }
  
      // Update JobCard status and lastUpdatedByAgent
      jobCard.status = "Ongoing";
      jobCard.lastUpdatedByAgent = agentId; // Ensure agentId exists in the correct table
      await jobCard.save();
  
      // Update agent's jobInHand
      agent.jobInHand += 1;
      await agent.save();
  
      return res.status(200).json({ 
        message: "Job card assigned successfully", 
        assignments: createdAssignments 
      });
    } catch (error) {
      console.error("Error in assignJobCardToAgent:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
  
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
