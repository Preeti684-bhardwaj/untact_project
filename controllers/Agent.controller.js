const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const BaseController = require("./base");
const models = require("../models");
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
      this.signup.bind(this)
    );
    this.router.post("/signin", this.signin.bind(this));
    this.router.get("/verify-email", this.verifyEmail.bind(this));
    this.router.post("/forgotPassword", this.forgotPassword.bind(this));
    this.router.post("/resetpassword/:agentId", this.resetPassword.bind(this));
    this.router.post("/sendOtp", this.sendOtp.bind(this));
    this.router.post("/otpVerification", this.emailOtpVerification.bind(this));
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

  signupByAdmin = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { name, email, phone, password } = req.body;
      if (
        [name, email, phone, password].some((field) => field?.trim() === "")
      ) {
        return res
          .status(400)
          .send({ message: "Please provide all necessary fields" });
      }

      if (!isValidEmail(email)) {
        return res.status(400).send({ message: "Invalid email" });
      }

      if (!isValidPhone(phone)) {
        return res.status(400).send({ message: "Invalid Phone Number" });
      }

      if (!isValidPassword(password)) {
        return res.status(400).send({
          message:
            "Password must contain at least 8 characters, including uppercase, lowercase, number and special character",
        });
      }

      if (!isValidLength(name)) {
        return res.status(400).send({
          message:
            "Name should be greater than 3 characters and less than 40 characters and should not start with number",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      // Check for existing agent by email or phone
      const existingAgentByEmail = await models.Agent.findOne({
        where: { email },
      });
      const existingAgentByPhone = await models.Agent.findOne({
        where: { phone },
      });
      let agent;
      if (existingAgentByEmail && existingAgentByPhone) {
        // Both email and phone already exist
        return res.status(400).send({
          message: "either email and phone number are already in use",
        });
      }

      if (existingAgentByEmail) {
        // Email exists but phone doesn't match
        if (existingAgentByEmail.phone !== phone) {
          return res.status(400).send({
            message: "phone already in use",
          });
        }
        // Update existing agent
        existingAgentByEmail.name = name;
        existingAgentByEmail.password = hashedPassword;
        await existingAgentByEmail.save({ transaction });
        agent = existingAgentByEmail;
      } else if (existingAgentByPhone) {
        // Phone exists but email doesn't match
        return res.status(400).send({
          message: "Phone number already in use",
        });
      } else {
        // Create new agent
        const emailToken = generateToken({ email });
        agent = await models.Agent.create(
          {
            name,
            email,
            phone,
            password: hashedPassword,
            emailToken,
          },
          { transaction }
        );
      }

      await transaction.commit();
      res.status(201).send({
        id: agent.id,
        email: agent.email,
        phone: agent.phone,
      });
    } catch (error) {
      await transaction.rollback();
      res.status(500).send({
        message: error.message || "Some error occurred during signup.",
      });
    }
  };

  //   Email OTP verification
  emailOtpVerification = async (req, res) => {
    const { phone, otp } = req.body;

    // Validate the OTP
    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required." });
    }

    try {
      const agent = await models.Agent.findOne({ where: { phone } });
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
          isEmailVerified:agent.isEmailVerified
        },
      });
    } catch (error) {
      res
        .status(500)
        .json({
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
          .send({ message: "Please provide all necessary fields" });
      }
      if (!email || !password) {
        return res.status(400).send({ message: "Please Enter Email & Password" });
      }
    try {
      const agent = await models.Agent.findOne({ where: { email } });
      if (!agent) {
        return res.status(404).send({ message: "Agent not found." });
      }
      if (!agent.isEmailVerified) {
        return res.status(400).send({ message: "agent is not verified" });
      }

      const isPasswordValid = await bcrypt.compare(password, agent.password);
      if (!isPasswordValid) {
        return res.status(403).send({ message: "Invalid password." });
      }

      const obj = {
        type: "AGENT",
        id: agent.id,
        email: agent.email,
      };

      const token = generateToken(obj);

      res.status(200).send({
        id: agent.id,
        token: token,
      });
    } catch (error) {
      res.status(500).send({
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
      return res.status(400).send({ message: "Missing email id" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).send({ message: "Invalid email address" });
    }

    try {
      // Find the agent by email
      const agent = await models.Agent.findOne({
        where: {
          email: email.trim(),
        },
      });

      if (!agent) {
        return res.status(404).send({ message: "Agent not found" });
      }
      if (!agent.isEmailVerified) {
        return res.status(400).send({ message: "Agent is not verified" });
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

      return res.status(500).send(error.message);
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
        .send({ message: "Missing required fields: password or OTP" });
    }

    try {
      // Find the agent by ID
      const agent = await models.Agent.findByPk(agentId);

      if (!agent) {
        return res.status(400).send({ message: "Agent not found" });
      }

      // Verify the OTP
      if (agent.otp !== otp.trim()) {
        return res.status(400).send({ message: "Invalid OTP" });
      }
      if (agent.otpExpire < Date.now()) {
        return res.status(400).send({ message: "expired OTP" });
      }

      // Update the agent's password and clear OTP fields
      agent.password = password;
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
      return res.status(500).send(error.message);
    }
  };

  // send OTP
  sendOtp = async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).send({ message: "Missing phone" });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).send({ message: "Invalid phone" });
    }

    try {
      const agent = await models.Agent.findOne({
        where: {
          phone: phone.trim(),
        },
      });

      if (!agent) {
        return res.status(404).send({ message: "Agent not found" });
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
        return res.status(500).send(emailError.message);
      }
    } catch (error) {
      return res.status(500).send(error.message);
    }
  };
}



module.exports = new AgentController();
