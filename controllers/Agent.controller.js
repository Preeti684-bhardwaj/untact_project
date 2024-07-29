const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const BaseController = require("./base");
const models = require("../models");
const {
  isValidEmail,
  isValidCountryCode,
  isValidPhone,
  isValidPassword,
  isValidTimeString,
  parseTimeString,
  isValidLength,
  updateDailySlotAvailability,
} = require("../utils/validation");
const sendEmail = require("../utils/sendEmail.js");
const moment = require("moment");
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

  signupByAgent = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { name, email, countryCode, phone, password, startTime, endTime } =
        req.body;

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
      if (!countryCode) {
        return res
          .status(400)
          .send({ success: false, message: "countryCode is required" });
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
      if (!startTime || !endTime) {
        return res.status(400).send({
          success: false,
          message: "Start time and end time are required",
        });
      }

      // Validate required fields
      const requiredFields = {
        name,
        email,
        countryCode,
        phone,
        password,
        startTime,
        endTime,
      };
      for (const [field, value] of Object.entries(requiredFields)) {
        if (!value) {
          await transaction.rollback();
          return res
            .status(400)
            .send({ success: false, message: `${field} is required` });
        }
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
      const countryCodeError = isValidCountryCode(countryCode);
      if (countryCodeError) {
        return res
          .status(400)
          .send({ success: false, message: countryCodeError });
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
          countryCode: countryCode,
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
      const { name, email, countryCode, phone, password, startTime, endTime } =
        req.body;

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
      if (!countryCode) {
        return res
          .status(400)
          .send({ success: false, message: "countryCode is required" });
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
      if (!startTime || !endTime) {
        return res.status(400).send({
          success: false,
          message: "Start time and end time are required",
        });
      }

      // Validate required fields
      const requiredFields = {
        name,
        email,
        countryCode,
        phone,
        password,
        startTime,
        endTime,
      };
      for (const [field, value] of Object.entries(requiredFields)) {
        if (!value) {
          await transaction.rollback();
          return res
            .status(400)
            .send({ success: false, message: `${field} is required` });
        }
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
      const countryCodeError = isValidCountryCode(countryCode);
      if (countryCodeError) {
        return res
          .status(400)
          .send({ success: false, message: countryCodeError });
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
          countryCode: countryCode,
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
          email: email.toLowerCase().trim(),
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
    if (!password) {
      return res.status(400).send({
        success: false,
        message: "Missing password",
      });
    }
    if (!otp) {
      return res.status(400).send({
        success: false,
        message: "Missing OTP",
      });
    }
    if (!agentId) {
      return res
        .status(400)
        .send({ success: false, message: "Missing AgentId in the params" });
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
      if (startTime || endTime) {
        if (
          !isValidTimeString(startTime) ||
          !isValidTimeString(endTime)
        ) {
          await transaction.rollback();
          return res.status(400).send({
            success: false,
            message:
              "Invalid time format. Please provide times in HH:mm:ss format.",
          });
        }

        const startMoment = moment(startTime, "HH:mm:ssZ");
        const endMoment = moment(endTime, "HH:mm:ssZ");

        if (startMoment.isSameOrAfter(endMoment)) {
          await transaction.rollback();
          return res.status(400).send({
            success: false,
            message: "Start time must be before end time.",
          });
        }
      }
      // Validate name
      if (otherFields.name) {
        const nameError = isValidLength(otherFields.name);
        if (nameError) {
          return res.status(400).send({ success: false, message: nameError });
        }
      }
      // validate email
      if (otherFields.email) {
        if ([otherFields.email].some((field) => field?.trim() === "")) {
          return res.status(400).send({
            success: false,
            message: "Missing email",
          });
        }
        if (!isValidEmail(otherFields.email)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid email" });
        }
      }
      // validate countryCode
      if (otherFields.countryCode) {
        if ([otherFields.countryCode].some((field) => field?.trim() === "")) {
          return res.status(400).send({
            success: false,
            message: "Missing country code",
          });
        }
        const countryCodeError = isValidCountryCode(otherFields.countryCode);
        if (countryCodeError) {
          return res
            .status(400)
            .send({ success: false, message: countryCodeError });
        }
      }
      // validate phone
      if (otherFields.phone) {
        if ([otherFields.phone].some((field) => field?.trim() === "")) {
          return res.status(400).send({
            success: false,
            message: "Missing Phone",
          });
        }
        if (!isValidPhone(otherFields.phone)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid Phone Number" });
        }
      }

      const [updatedRows] = await models.Agent.update(
        { ...otherFields, startTime, endTime },
        {
          where: { id: id },
        }
      );

      if (updatedRows > 0) {
        const updatedItem = await models.Agent.findByPk(id, {
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
      const occupiedSlots = agent.jobs.filter(
        (job) =>
          moment(job.startTime).isSame(date, "day") ||
          moment(job.endTime).isSame(date, "day")
      );

      slots.forEach((slot) => {
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
        if (!slot.startTime || !slot.endTime) {
          return res
            .status(400)
            .json({ error: `Invalid slot times for slot ${i}` });
        }

        const startTime = new Date(slot.startTime);
        const endTime = new Date(slot.endTime);

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
      const date = new Date(selectedSlots[0].startTime)
        .toISOString()
        .split("T")[0];
      const dailySlot = await models.DailySlot.findOne({
        where: { agentId, date, JobPostId: jobPostId },
      });

      if (!dailySlot) {
        return res.status(404).json({ error: "DailySlot not found" });
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
