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

const generateToken = (organization) => {
  return jwt.sign({ obj: organization }, process.env.JWT_SECRET, {
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

class OrganizationController extends BaseController {
  constructor() {
    super(models.Organization);
    this.router.post(
      "/signup",
      authenticate,
      authorizeAdmin,
      this.signupByAdmin.bind(this)
    );
    this.router.post(
      "/signupOrganization",
      this.signupByOrganization.bind(this)
    );
    this.router.post("/signin", this.signin.bind(this));
    this.router.get("/verify-email", this.verifyEmail.bind(this));
    this.router.post("/forgotPassword", this.forgotPassword.bind(this));
    this.router.post(
      "/resetpassword/:organizationId",
      this.resetPassword.bind(this)
    );
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
    // Add additional setup after creating an organization, if necessary
  }
  signupByOrganization = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const {
        name,
        type,
        description,
        contact_person_name,
        email,
        phone,
        password,
        location,
      } = req.body;
      // Validate input fields
      if (
        [
          name,
          type,
          contact_person_name,
          email,
          phone,
          password,
          location,
        ].some((field) => field?.trim() === "")
      ) {
        return res
          .status(400)
          .send({ message: "Please provide all necessary fields" });
      }
      if (!isValidPhone(phone)) {
        return res.status(400).send({ message: "Invalid Phone Number" });
      }

      if (!isValidEmail(email)) {
        return res.status(400).send({ message: "Invalid email" });
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
      if (!isValidLength(contact_person_name)) {
        return res.status(400).send({
          message:
            "Name should be greater than 3 characters and less than 40 characters and should not start with number",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Check for existing organization by email or phone
      //   const existingOrganizationByEmail = await models.Organization.findOne({
      //     where: { email },
      //   });
      //   const existingOrganizationByPhone = await models.Organization.findOne({
      //     where: { phone },
      //   });
      //   let organization;
      //   if (existingOrganizationByEmail && existingOrganizationByPhone) {
      //     // Both email and phone already exist
      //     return res.status(400).send({
      //       message: "either email and phone number are already in use",
      //     });
      //   }

      //   if (existingOrganizationByEmail) {
      //     // Email exists but phone doesn't match
      //     if (existingOrganizationByEmail.phone !== phone) {
      //       return res.status(400).send({
      //         message: "phone already in use",
      //       });
      //     }
      //     // Update existing organization
      //     existingOrganizationByEmail.name = name;
      //     existingOrganizationByEmail.password = hashedPassword;
      //     await existingOrganizationByEmail.save({ transaction });
      //     organization = existingOrganizationByEmail;
      //   } else if (existingOrganizationByPhone) {
      //     // Phone exists but email doesn't match
      //     return res.status(400).send({
      //       message: "Phone number already in use",
      //     });
      //   } else {
      //     // Create new organization
      //     const emailToken = generateToken({ email });
      //     organization = await models.Organization.create(
      //         {
      //           name,
      //           type,
      //           description,
      //           contact_person_name,
      //           email,
      //           phone,
      //           password: hashedPassword,
      //           location,
      //           emailToken
      //         },
      //         { transaction }
      //       );
      //     }

      //     await transaction.commit();
      //     res.status(201).send({
      //       id: organization.id,
      //       name: organization.name,
      //       email: organization.email,
      //       phone: organization.phone
      //     });
      //   } catch (error) {
      //     await transaction.rollback();
      //     res.status(500).send({
      //       message: error.message || "Some error occurred during signup.",
      //     });
      //   }
      // };
      const existingOrganization = await models.Organization.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase() }, { phone }],
          },
        },
        { transaction }
      );

      if (existingOrganization) {
        await transaction.rollback();
        if (
          existingOrganization.email.toLowerCase() === email.toLowerCase() &&
          existingOrganization.phone === phone
        ) {
          return res.status(400).send({
            message: "Both email and phone number are already in use",
          });
        } else if (
          existingOrganization.email.toLowerCase() === email.toLowerCase()
        ) {
          return res.status(400).send({ message: "Email already in use" });
        } else {
          return res
            .status(400)
            .send({ message: "Phone number already in use" });
        }
      }

      // If no existing admin, create a new one
      const emailToken = generateToken({ email: email.toLowerCase() });

      const newOrganization = await models.Agent.create(
        {
          name,
          type,
          description,
          contact_person_name,
          email,
          phone,
          password: hashedPassword,
          location,
          emailToken,
        },
        { transaction }
      );

      await transaction.commit();

      res.status(201).send({
        id: newOrganization.id,
        name: newOrganization.name,
        email: newOrganization.email,
        phone: newOrganization.phone,
      });
    } catch (error) {
      console.error("Signup error:", error);
      if (transaction) await transaction.rollback();
      res.status(500).send({
        message: "An error occurred during signup. Please try again later.",
      });
    }
  };

  signupByAdmin = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const {
        name,
        type,
        description,
        contact_person_name,
        email,
        phone,
        password,
        location,
      } = req.body;
      // Validate input fields
      if (
        [
          name,
          type,
          contact_person_name,
          email,
          phone,
          password,
          location,
        ].some((field) => field?.trim() === "")
      ) {
        return res
          .status(400)
          .send({ message: "Please provide all necessary fields" });
      }
      if (!isValidPhone(phone)) {
        return res.status(400).send({ message: "Invalid Phone Number" });
      }

      if (!isValidEmail(email)) {
        return res.status(400).send({ message: "Invalid email" });
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
      if (!isValidLength(contact_person_name)) {
        return res.status(400).send({
          message:
            "contact person name should be greater than 3 characters and less than 40 characters and should not start with number",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Check for existing organization by email or phone
      //       const existingOrganizationByEmail = await models.Organization.findOne({
      //         where: { email },
      //       });
      //       const existingOrganizationByPhone = await models.Organization.findOne({
      //         where: { phone },
      //       });
      //       let organization;
      //       if (existingOrganizationByEmail && existingOrganizationByPhone) {
      //         // Both email and phone already exist
      //         return res.status(400).send({
      //           message: "either email and phone number are already in use",
      //         });
      //       }

      //       if (existingOrganizationByEmail) {
      //         // Email exists but phone doesn't match
      //         if (existingOrganizationByEmail.phone !== phone) {
      //           return res.status(400).send({
      //             message: "phone already in use",
      //           });
      //         }
      //         // Update existing organization
      //         existingOrganizationByEmail.name = name;
      //         existingOrganizationByEmail.password = hashedPassword;
      //         await existingOrganizationByEmail.save({ transaction });
      //         organization = existingOrganizationByEmail;
      //       } else if (existingOrganizationByPhone) {
      //         // Phone exists but email doesn't match
      //         return res.status(400).send({
      //           message: "Phone number already in use",
      //         });
      //       } else {
      //         // Create new organization
      //         const emailToken = generateToken({ email });
      //         organization = await models.Organization.create(
      //           {
      //             name,
      //             type,
      //             description,
      //             contact_person_name,
      //             email,
      //             phone,
      //             password: hashedPassword,
      //             location,
      //             emailToken,
      //             isEmailVerified: true,
      //           },
      //           { transaction }
      //         );
      //       }

      //       await transaction.commit();
      //       res.status(201).send({
      //         id: organization.id,
      //         name: organization.name,
      //         email: organization.email,
      //         phone: organization.phone,
      //         isEmailVerified: organization.isEmailVerified,
      //       });
      //     } catch (error) {
      //       await transaction.rollback();
      //       res.status(500).send({
      //         message: error.message || "Some error occurred during signup.",
      //       });
      //     }
      //   };
      const existingOrganization = await models.Organization.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase() }, { phone }],
          },
        },
        { transaction }
      );
      console.log(existingOrganization);

      if (existingOrganization) {
        await transaction.rollback();
        if (
          existingOrganization.email.toLowerCase() === email.toLowerCase() &&
          existingOrganization.phone === phone
        ) {
          return res.status(400).send({
            message: "Both email and phone number are already in use",
          });
        } else if (
          existingOrganization.email.toLowerCase() === email.toLowerCase()
        ) {
          return res.status(400).send({ message: "Email already in use" });
        } else {
          return res
            .status(400)
            .send({ message: "Phone number already in use" });
        }
      }

      // If no existing admin, create a new one
      const emailToken = generateToken({ email: email.toLowerCase() });

      const newOrganization = await models.Agent.create(
        {
          name,
          type,
          description,
          contact_person_name,
          email,
          phone,
          password: hashedPassword,
          location,
          emailToken,
          isEmailVerified: true,
        },
        { transaction }
      );

      await transaction.commit();

      res.status(201).send({
        id: newOrganization.id,
        name: newOrganization.name,
        email: newOrganization.email,
        phone: newOrganization.phone,
        isEmailVerified: newOrganization.isEmailVerified,
        createdAt: newOrganization.createdAt,
        updatedAt: newOrganization.updatedAt,
      });
    } catch (error) {
      console.error("Signup error:", error);
      if (transaction) await transaction.rollback();
      res.status(500).send({
        message: "An error occurred during signup. Please try again later.",
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
      const organization = await models.Organization.findOne({
        where: { phone },
      });
      console.log(organization);
      if (!organization) {
        return res.status(400).json({
          success: false,
          message: "Organization not found or invalid details.",
        });
      }

      // Check OTP validity
      if (organization.otp !== otp) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
      }
      if (organization.otpExpire < Date.now()) {
        return res
          .status(400)
          .json({ success: false, message: "expired OTP." });
      }

      // Update organization details
      organization.isEmailVerified = true;
      organization.otp = null;
      organization.otpExpire = null;
      await organization.save();

      res.status(201).json({
        success: true,
        message: "Organization data",
        organization: {
          id: organization.id,
          name: organization.name,
          email: organization.email,
          phone: organization.phone,
          isEmailVerified: organization.isEmailVerified,
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
        .send({ message: "Please provide all necessary fields" });
    }
    if (!email || !password) {
      return res.status(400).send({ message: "Please Enter Email & Password" });
    }
    try {
      const organization = await models.Organization.findOne({
        where: { email },
      });
      if (!organization) {
        return res.status(404).send({ message: "Organization not found." });
      }
      if (!organization.isEmailVerified) {
        return res
          .status(400)
          .send({ message: "Organization is not verified" });
      }

      const isPasswordValid = await bcrypt.compare(
        password,
        organization.password
      );
      if (!isPasswordValid) {
        return res.status(403).send({ message: "Invalid password." });
      }

      const obj = {
        type: "ORGANIZATION",
        id: organization.id,
        email: organization.email,
      };

      const token = generateToken(obj);

      res.status(200).send({
        id: organization.id,
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
      const organization = await models.Organization.findByPk(decoded.obj.id);

      if (!organization) {
        return res.status(404).send({ message: "Organization not found." });
      }

      organization.isEmailVerified = true;
      await organization.save();

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
      // Find the organization by email
      const organization = await models.Organization.findOne({
        where: {
          email: email.trim(),
        },
      });

      if (!organization) {
        return res.status(404).send({ message: "Organization not found" });
      }
      if (!organization.isEmailVerified) {
        return res
          .status(400)
          .send({ message: "Organization is not verified" });
      }

      // Get ResetPassword Token
      const otp = generateOtp(); // Assuming you have a method to generate the OTP
      organization.otp = otp;
      organization.otpExpire = Date.now() + 15 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

      await organization.save({ validate: false });

      const message = `Your One Time Password is ${otp}`;

      await sendEmail({
        email: organization.email,
        subject: `Password Recovery`,
        message,
      });

      res.status(200).json({
        success: true,
        message: `OTP sent to ${organization.email} successfully`,
        organizationId: organization.id,
      });
    } catch (error) {
      organization.otp = null;
      organization.otpExpire = null;
      await organization.save({ validate: false });

      return res.status(500).send(error.message);
    }
  };

  // reset password
  resetPassword = async (req, res) => {
    const { password, otp } = req.body;
    const organizationId = req.params.organizationId;

    // Validate input fields
    if (!password || !otp) {
      return res
        .status(400)
        .send({ message: "Missing required fields: password or OTP" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
      // Find the organization by ID
      const organization = await models.Organization.findByPk(organizationId);

      if (!organization) {
        return res.status(400).send({ message: "Organization not found" });
      }

      // Verify the OTP
      if (organization.otp !== otp.trim()) {
        return res.status(400).send({ message: "Invalid OTP" });
      }
      if (organization.otpExpire < Date.now()) {
        return res.status(400).send({ message: "expired OTP" });
      }

      // Update the organization's password and clear OTP fields
      organization.password = hashedPassword;
      organization.otp = null;
      organization.otpExpire = null;

      await organization.save({ validate: true });

      // Exclude password from the response
      const updatedOrganization = await models.Organization.findByPk(
        organization.id,
        {
          attributes: {
            exclude: ["password"],
          },
        }
      );

      return res.status(200).json({
        success: true,
        message: `Password updated for ${updatedOrganization.email}`,
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
      const organization = await models.Organization.findOne({
        where: {
          phone: phone.trim(),
        },
      });

      if (!organization) {
        return res.status(404).send({ message: "Organization not found" });
      }

      const otp = generateOtp();
      organization.otp = otp;
      organization.otpExpire = Date.now() + 15 * 60 * 1000;

      await organization.save({ validate: false });

      const message = `Your One Time Password (OTP) is ${otp}`;
      try {
        await sendEmail({
          email: organization.email,
          subject: `One-Time Password (OTP) for Verification`,
          message,
        });

        res.status(200).json({
          success: true,
          message: `OTP sent to ${organization.email} successfully`,
          email: organization.email,
          organizationId: organization.id,
        });
      } catch (emailError) {
        organization.otp = null;
        organization.otpExpire = null;
        await organization.save({ validate: false });

        console.error("Failed to send OTP email:", emailError);
        return res.status(500).send(emailError.message);
      }
    } catch (error) {
      return res.status(500).send(error.message);
    }
  };
}

module.exports = new OrganizationController();
