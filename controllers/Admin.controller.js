const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const BaseController = require("./base");
const models = require("../models");
const {
  isValidEmail,
  isValidPassword,
  isValidLength,
} = require("../utils/validation");
const { Op } = require("sequelize");
const sequelize = require("../config/db.config").sequelize; // Ensure this path is correct

const generateToken = (admin) => {
  return jwt.sign({ obj: admin }, process.env.JWT_SECRET, {
    expiresIn: "72h", // expires in 72 hours
  });
};

class AdminController extends BaseController {
  constructor() {
    super(models.Admin);
    this.router.post("/signup", this.signup.bind(this));
    this.router.post("/signin", this.signin.bind(this));
    this.router.get("/verify-email", this.verifyEmail.bind(this));
    this.router.put("/updateAdmin/:id", this.updateAdmin.bind(this));
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
    // Add additional setup after creating an admin, if necessary
  }
  // signUp of Admin
  signup = async (req, res) => {
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
      // const countryCodeError = isValidCountryCode(countryCode);
      // if (countryCodeError) {
      //   return res.status(400).send({ success: false, message: countryCodeError });
      // }
      // if (!isValidPhone(phone)) {
      //   return res
      //     .status(400)
      //     .send({ success: false, message: "Invalid Phone Number" });
      // }
      const existingAdmin = await models.Admin.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase() }, { phone: phone }],
          },
        },
        { transaction }
      );

      if (existingAdmin) {
        await transaction.rollback();
        if (
          existingAdmin.email.toLowerCase() === email.toLowerCase() &&
          existingAdmin.phone === phone
        ) {
          return res.status(400).send({
            success: false,
            message: "Both email and phone number are already in use",
          });
        } else if (existingAdmin.email.toLowerCase() === email.toLowerCase()) {
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

      const newAdmin = await models.Admin.create(
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
      const adminResponse = newAdmin.get({ plain: true });
      delete adminResponse.password;

      await transaction.commit();

      res.status(201).send({
        success: true,
        message: "Admin registered successfully",
        ...adminResponse,
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
  // signIn of Admin
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
      const admin = await models.Admin.findOne({
        where: { email: email.toLowerCase().trim() },
      });
      if (!admin) {
        return res
          .status(404)
          .send({ success: false, message: "Admin not found." });
      }
      if (!admin.isEmailVerified) {
        return res
          .status(400)
          .send({ success: false, message: "admin is not verified" });
      }
      const isPasswordValid = await bcrypt.compare(password, admin.password);
      if (!isPasswordValid) {
        return res
          .status(403)
          .send({ success: false, message: "Invalid password." });
      }
      //   console.log(admin.id);
      const obj = {
        type: "ADMIN",
        id: admin.id,
        email: admin.email,
      };

      const token = generateToken(obj);

      res.status(200).send({
        success: true,
        message: "admin login successfully",
        id: admin.id,
        token: token,
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: error.message || "Some error occurred during signin.",
      });
    }
  };
  // Verify email (not in use)
  verifyEmail = async (req, res) => {
    const { token } = req.query;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const admin = await models.Admin.findByPk(decoded.obj.id);

      if (!admin) {
        return res
          .status(404)
          .send({ success: false, message: "Admin not found." });
      }

      admin.isEmailVerified = true;
      await admin.save();

      res
        .status(200)
        .send({ success: true, message: "Email verified successfully." });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: error.message || "Could not verify email.",
      });
    }
  };
  //  update Admin
  async updateAdmin(req, res) {
    try {
      const id = req.params.id;
      const { name } = req.body;
  
      // Validate and sanitize the name
      if (name && typeof name === 'string' && name.trim() !== '') {
        const trimmedName = name.trim();
  
        // Check if the trimmed name is still non-empty
        if (trimmedName === '') {
          return res.status(400).json({
            success: false,
            error: 'Name cannot be empty or whitespace.',
          });
        }
  
        // Prepare the update object
        const updateData = { name: trimmedName };
  
        // Validate name length (assuming `isValidLength` is a custom function)
        const nameError = isValidLength(trimmedName);
        if (nameError) {
          return res.status(400).json({ success: false, message: nameError });
        }
  
        // Update the admin
        const [updatedRowsCount] = await models.Admin.update(updateData, {
          where: { id: id },
        });
  
        if (updatedRowsCount > 0) {
          const updatedItem = await models.Admin.findByPk(id, {
            attributes: { exclude: ['password'] },
          });
  
          if (updatedItem) {
            return res.json({
              success: true,
              message: 'Admin updated successfully',
              data: updatedItem,
            });
          } else {
            return res.status(404).json({ success: false, error: 'Admin not found after update' });
          }
        } else {
          return res.status(404).json({
            success: false,
            error: 'Admin not found or couldn\'t be updated',
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          error: 'Name is a required field and cannot be empty or whitespace.',
        });
      }
    } catch (error) {
      console.error('Update error:', error);
      return res.status(500).json({
        success: false,
        error: 'An error occurred while updating the admin',
      });
    }
  }  
}

module.exports = new AdminController();
