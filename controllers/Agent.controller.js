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

      if (!isValidPassword(password)) {
        return res.status(400).send({
          success: false,
          message:
            "Password must contain at least 8 characters, including uppercase, lowercase, number and special character",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
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

      // If no existing admin, create a new one
      const emailToken = generateToken({ email: email.toLowerCase() });

      const newAgent = await models.Agent.create(
        {
          name,
          email: email.toLowerCase(),
          phone,
          password: hashedPassword,
          emailToken,
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

      if (
        [name, email, phone, password].some((field) => field?.trim() === "")
      ) {
        return res
          .status(400)
          .send({ message: "Please provide all necessary fields" });
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

      if (!isValidPassword(password)) {
        return res.status(400).send({
          success: false,
          message:
            "Password must contain at least 8 characters, including uppercase, lowercase, number and special character",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
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
      const agent = await models.Agent.findOne({
        where: { email: email.trim() },
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
      return res
        .status(400)
        .send({
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
      return res
        .status(400)
        .send({
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

      if ("password" in req.body) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Password cannot be updated by Admin",
          });
      }

      const [updatedRows] = await this.model.update(req.body, {
        where: { id: id },
      });

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
      res
        .status(500)
        .json({
          success: false,
          error: "An error occurred while updating the item",
        });
    }
  };
}

module.exports = new AgentController();
