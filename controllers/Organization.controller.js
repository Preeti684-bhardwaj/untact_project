const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const BaseController = require("./base");
const models = require("../models");
const {
  isValidEmail,
  isValidLocation,
  isValidDescription,
  isValidPassword,
  isValidLength,
} = require("../utils/validation");
const { Op } = require("sequelize");
const sequelize = require("../config/db.config").sequelize; // Ensure this path is correct
const { authenticate, authorizeAdmin } = require("../controllers/auth");

const generateToken = (organization) => {
  return jwt.sign({ obj: organization }, process.env.JWT_SECRET, {
    expiresIn: "72h", // expires in 72 hours
  });
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
    this.router.put(
      "/updateByAdmin/:id",
      authenticate,
      authorizeAdmin,
      this.updateByAdmin.bind(this)
    );
    this.router.put(
      "/updateByOrganization/:id",
      this.updateByOrganization.bind(this)
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
    // Add additional setup after creating an organization, if necessary
  }
  // signUp By Organization
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
      // mandatory field check
      if (!name) {
        return res
          .status(400)
          .send({ success: false, message: "Name is required" });
      }
      if (!type) {
        return res
          .status(400)
          .send({ success: false, message: "Type is required" });
      }
      if (!description) {
        return res
          .status(400)
          .send({ success: false, message: "Description is required" });
      }
      if (!contact_person_name) {
        return res
          .status(400)
          .send({ success: false, message: "Contact Person Name is required" });
      }
      if (!email) {
        return res
          .status(400)
          .send({ success: false, message: "Email is required" });
      }
      // if (!countryCode) {
      //   return res
      //     .status(400)
      //     .send({ success: false, message: "Country Code is required" });
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
      if (!location) {
        return res
          .status(400)
          .send({ success: false, message: "Location is required" });
      }

      // Validate input fields
      if (
        [
          name,
          type,
          description,
          contact_person_name,
          email,
          phone,
          password,
          location,
        ].some((field) => field?.trim() === "")
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
      // validate type
      const typeError = isValidLength(type);
      if (typeError) {
        return res.status(400).send({ success: false, message: typeError });
      }
      // validate description
      const descriptionError = isValidDescription(description);
      if (descriptionError) {
        return res
          .status(400)
          .send({ success: false, message: descriptionError });
      }
      // validate contact person name
      const contactPersonNameError = isValidLength(contact_person_name);
      if (contactPersonNameError) {
        return res
          .status(400)
          .send({ success: false, message: contactPersonNameError });
      }
      // validate location
      const locationError = isValidLocation(location);
      if (locationError) {
        return res.status(400).send({ success: false, message: locationError });
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
      if (!isValidEmail(email)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid email" });
      }
      const existingOrganization = await models.Organization.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase() }, { phone: phone }],
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
            success: false,
            message: "Both email and phone number are already in use",
          });
        } else if (
          existingOrganization.email.toLowerCase() === email.toLowerCase()
        ) {
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

      const newOrganization = await models.Organization.create(
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

      // Convert to plain object and exclude password
      const organizationResponse = newOrganization.get({ plain: true });
      delete organizationResponse.password;

      await transaction.commit();

      res.status(201).send({
        success: true,
        message: "Organization registered successfully",
        ...organizationResponse,
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
  // signUp of Organization by admin
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
      // mandatory field check
      if (!name) {
        return res
          .status(400)
          .send({ success: false, message: "Name is required" });
      }
      if (!type) {
        return res
          .status(400)
          .send({ success: false, message: "Type is required" });
      }
      if (!description) {
        return res
          .status(400)
          .send({ success: false, message: "Description is required" });
      }
      if (!contact_person_name) {
        return res
          .status(400)
          .send({ success: false, message: "Contact Person Name is required" });
      }
      if (!email) {
        return res
          .status(400)
          .send({ success: false, message: "Email is required" });
      }
      // if (!countryCode) {
      //   return res
      //     .status(400)
      //     .send({ success: false, message: "Country Code is required" });
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
      if (!location) {
        return res
          .status(400)
          .send({ success: false, message: "Location is required" });
      }

      // Validate input fields
      if (
        [
          name,
          type,
          description,
          contact_person_name,
          email,
          phone,
          password,
          location,
        ].some((field) => field?.trim() === "")
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
      // validate type
      const typeError = isValidLength(type);
      if (typeError) {
        return res.status(400).send({ success: false, message: typeError });
      }
      // validate description
      const descriptionError = isValidDescription(description);
      if (descriptionError) {
        return res
          .status(400)
          .send({ success: false, message: descriptionError });
      }
      // validate contact person name
      const contactPersonNameError = isValidLength(contact_person_name);
      if (contactPersonNameError) {
        return res
          .status(400)
          .send({ success: false, message: contactPersonNameError });
      }
      // validate location
      const locationError = isValidLocation(location);
      if (locationError) {
        return res.status(400).send({ success: false, message: locationError });
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
      if (!isValidEmail(email)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid email" });
      }
      // DB call
      const existingOrganization = await models.Organization.findOne(
        {
          where: {
            [Op.or]: [{ email: email.toLowerCase() }, { phone: phone }],
          },
        },
        { transaction }
      );
      console.log(existingOrganization);
      // existing user check
      if (existingOrganization) {
        await transaction.rollback();
        if (
          existingOrganization.email.toLowerCase() === email.toLowerCase() &&
          existingOrganization.phone === phone
        ) {
          return res.status(400).send({
            success: false,
            message: "Both email and phone number are already in use",
          });
        } else if (
          existingOrganization.email.toLowerCase() === email.toLowerCase()
        ) {
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

      const newOrganization = await models.Organization.create(
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

      // Convert to plain object and exclude password
      const organizationResponse = newOrganization.get({ plain: true });
      delete organizationResponse.password;

      await transaction.commit();

      res.status(201).send({
        success: true,
        message: "Organization registered successfully",
        ...organizationResponse,
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
  // signIn Organization
  signin = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .send({ success: false, message: "Please Enter Email & Password" });
    }
    if ([email, password].some((field) => field?.trim() === "")) {
      return res.status(400).send({
        success: false,
        message: "Please provide all necessary fields",
      });
    }
    try {
      const organization = await models.Organization.findOne({
        where: { email: email.toLowerCase().trim() },
      });
      if (!organization) {
        return res
          .status(404)
          .send({ success: false, message: "Organization not found." });
      }
      if (!organization.isEmailVerified) {
        return res
          .status(400)
          .send({ success: false, message: "Organization is not verified" });
      }

      const isPasswordValid = await bcrypt.compare(
        password,
        organization.password
      );
      if (!isPasswordValid) {
        return res
          .status(403)
          .send({ success: false, message: "Invalid password." });
      }

      const obj = {
        type: "ORGANIZATION",
        id: organization.id,
        email: organization.email,
      };

      const token = generateToken(obj);

      res.status(200).send({
        success: true,
        message: "Organization login successfully",
        id: organization.id,
        token: token,
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: error.message || "Some error occurred during signin.",
      });
    }
  };
  // verify email (not in use)
  verifyEmail = async (req, res) => {
    const { token } = req.query;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const organization = await models.Organization.findByPk(decoded.obj.id);

      if (!organization) {
        return res
          .status(404)
          .send({ status: false, message: "Organization not found." });
      }

      organization.isEmailVerified = true;
      await organization.save();

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
  // update by admin
  updateByAdmin = async (req, res) => {
    try {
      const id = req.params.id;
      const { name, email, type, description, location } = req.body;
  
      // Check for password field
      if ("password" in req.body) {
        return res.status(400).json({
          success: false,
          error: "Password cannot be updated by Admin",
        });
      }
  
      // Validate name
      if (name !== undefined) {
        const nameError = isValidLength(name);
        if (nameError) {
          return res.status(400).send({ success: false, message: nameError });
        }
      }
  
      // Validate email
      if (email !== undefined) {
        if (!isValidEmail(email)) {
          return res.status(400).send({ success: false, message: "Invalid email" });
        }
      }
  
      // Validate type
      if (type !== undefined) {
        const typeError = isValidLength(type);
        if (typeError) {
          return res.status(400).send({ success: false, message: typeError });
        }
      }
  
      // Validate description
      if (description !== undefined) {
        const descriptionError = isValidDescription(description);
        if (descriptionError) {
          return res.status(400).send({ success: false, message: descriptionError });
        }
      }
  
      // Validate location
      if (location !== undefined) {
        const locationError = isValidLocation(location);
        if (locationError) {
          return res.status(400).send({ success: false, message: locationError });
        }
      }
  
      // Prepare the update data object
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (type !== undefined) updateData.type = type;
      if (description !== undefined) updateData.description = description;
      if (location !== undefined) updateData.location = location;
  
      // Perform the update operation
      const [updatedRows] = await models.Organization.update(updateData, {
        where: { id: id },
      });
  
      if (updatedRows > 0) {
        const updatedItem = await models.Organization.findByPk(id, {
          attributes: { exclude: ["password"] },
        });
        return res.json({
          success: true,
          message: "Updated successfully by admin",
          data: updatedItem,
        });
      } else {
        return res.status(404).json({ success: false, error: "Item not found" });
      }
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  };
  
  // update by organization
  updateByOrganization = async (req, res) => {
    try {
      const id = req.params.id;
      const { name, contact_person_name } = req.body;

      // Check if at least one of name or contact_person_name is provided
      if (!name && !contact_person_name) {
        return res.status(400).json({
          success: false,
          error:
            "Either name or contact person name must be provided for update",
        });
      }

      const updateData = {};

      // Validate and add name if provided
      if (name !== undefined) {
        if (typeof name !== "string" || name.trim() === "") {
          return res.status(400).send({
            success: false,
            message: "Name must be a non-empty string",
          });
        }
        const nameError = isValidLength(name);
        if (nameError) {
          return res.status(400).send({ success: false, message: nameError });
        }
        updateData.name = name.trim();
      }

      // Validate and add contact_person_name if provided
      if (contact_person_name !== undefined) {
        if (
          typeof contact_person_name !== "string" ||
          contact_person_name.trim() === ""
        ) {
          return res.status(400).send({
            success: false,
            message: "Contact Person Name must be a non-empty string",
          });
        }
        const contactPersonNameError = isValidLength(contact_person_name);
        if (contactPersonNameError) {
          return res
            .status(400)
            .send({ success: false, message: contactPersonNameError });
        }
        updateData.contact_person_name = contact_person_name.trim();
      }

      const [updated] = await models.Organization.update(updateData, {
        where: { id: id },
      });

      if (updated) {
        const updatedItem = await models.Organization.findByPk(id, {
          attributes: { exclude: ["password"] },
        });

        if (!updatedItem) {
          return res
            .status(404)
            .json({ success: false, error: "Item not found after update" });
        }

        res.json({
          success: true,
          message: "Updated successfully by agent",
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
}

module.exports = new OrganizationController();
