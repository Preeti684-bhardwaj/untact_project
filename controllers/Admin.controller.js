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
const sequelize = require("../config/db.config").sequelize; // Ensure this path is correct

const generateToken = (admin) => {
  return jwt.sign({ obj: admin }, process.env.JWT_SECRET, {
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
  

class AdminController extends BaseController {
  constructor() {
    super(models.Admin);
    this.router.post("/signup", this.signup.bind(this));
    this.router.post("/signin", this.signin.bind(this));
    this.router.get("/verify-email", this.verifyEmail.bind(this));
    this.router.post("/forgotPassword", this.forgotPassword.bind(this));
    this.router.post("/resetpassword/:userId", this.resetPassword.bind(this));
    this.router.post("/sendOtp", this.sendOtp.bind(this));
    this.router.post("/otpVerification",this.emailOtpVerification.bind(this));
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

  signup = async (req, res) => {
    const transaction = await sequelize.transaction(); // Use sequelize from the imported config
    try {
      const { name,email, phone, password } = req.body;
       // Validate input fields
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

      // Check for existing admin by email or phone
      const existingAdminByEmail = await models.Admin.findOne({
        where: { email },
      });
      const existingAdminByPhone = await models.Admin.findOne({
        where: { phone },
      });
      let admin;
      if (existingAdminByEmail && existingAdminByPhone) {
        // Both email and phone already exist
        return res.status(400).send({
          message: "either email and phone number are already in use",
        });
      }

      if (existingAdminByEmail) {
        // Email exists but phone doesn't match
        if (existingAdminByEmail.phone !== phone) {
          return res.status(400).send({
            message: "phone already in use",
          });
        }
         // Update existing admin
         existingAdminByEmail.name = name;
         existingAdminByEmail.password = hashedPassword;
         await existingAdminByEmail.save({ transaction });
         admin = existingAdminByEmail;
       } else if (existingAdminByPhone) {
         // Phone exists but email doesn't match
         return res.status(400).send({
           message: "Phone number already in use",
         });
       } else {
         // Create new admin
         const emailToken = generateToken({ email });
         admin = await models.Admin.create(
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
         id: admin.id,
         email: admin.email,
         phone: admin.phone,
       });
     } catch (error) {
       await transaction.rollback();
       res.status(500).send({
         message: error.message || "Some error occurred during signup.",
       });
     }
   };

   //   Email OTP verification
 emailOtpVerification =async (req, res) => {
    const { phone, otp} = req.body;
  
    // Validate the OTP
    if (!otp) {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required." });
    }
  
    try {
      const admin = await models.Admin.findOne({ where: { phone } });
      console.log(admin);
      if (!admin) {
        return res.status(400).json({
          success: false,
          message: "Admin not found or invalid details.",
        });
      }
  
      // Check OTP validity
      if (admin.otp !== otp) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
      }
      if (admin.otpExpire < Date.now()) {
        return res.status(400).json({ success: false, message: "expired OTP." });
      }
  
      // Update admin details
      admin.IsEmailVerified = true;
      admin.otp = null;
      admin.otpExpire = null;
      await admin.save();
  
      res.status(201).json({
        success: true,
        message: "Admin data",
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          phone: admin.phone,
        },
      });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: "Server Error", error: error.message });
    }
  };

  signin = async (req, res) => {
    const { email, password } = req.body;
    if (
        [ email,password].some((field) => field?.trim() === "")
      ) {
        return res
          .status(400)
          .send({ message: "Please provide all necessary fields" });
      }
      if (!email || !password) {
        return res.status(400).send({ message: "Please Enter Email & Password" });
      }
    try {
      const admin = await models.Admin.findOne({ where: { email } });
      if (!admin) {
        return res.status(404).send({ message: "Admin not found." });
      }

      const isPasswordValid = await bcrypt.compare(password, admin.password);
      if (!isPasswordValid) {
        return res.status(403).send({ message: "Invalid password." });
      }
    //   console.log(admin.id);
      const obj = {
        type: "ADMIN",
        id: admin.id,
        email: admin.email,
      };

      const token = generateToken(obj);

      res.status(200).send({
        id: admin.id,
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

      const admin = await models.Admin.findByPk(decoded.obj.id);

      if (!admin) {
        return res.status(404).send({ message: "Admin not found." });
      }

      admin.isEmailVerified = true;
      await admin.save();

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
      // Find the admin by email
      const admin = await models.Admin.findOne({
        where: {
          email: email.trim(),
        },
      });

      if (!admin) {
        return res.status(404).send({ message: "Admin not found" });
      }
        if (!admin.isEmailVerified) {
          return res.status(404).send({message:"Admin is not verified"});
        }

      // Get ResetPassword Token
      const otp = generateOtp(); // Assuming you have a method to generate the OTP
      admin.otp = otp;
      admin.otpExpire = Date.now() + 15 * 60 * 1000; // Set OTP expiration time (e.g., 15 minutes)

      await admin.save({ validate: false });

      const message = `Your One Time Password is ${otp}`;

      await sendEmail({
        email: admin.email,
        subject: `Password Recovery`,
        message,
      });

      res.status(200).json({
        success: true,
        message: `OTP sent to ${admin.email} successfully`,
        adminId: admin.id,
      });
    } catch (error) {
      admin.otp = null;
      admin.otpExpire = null;
      await admin.save({ validate: false });

      return res.status(500).send(error.message);
    }
  };

  // reset password
  resetPassword = async (req, res) => {
    const { password, otp } = req.body;
    const adminId = req.params.adminId;

    // Validate input fields
    if (!password || !otp) {
      return res
        .status(400)
        .send({ message: "Missing required fields: password or OTP" });
    }

    try {
      // Find the admin by ID
      const admin = await models.Admin.findByPk(adminId);

      if (!admin) {
        return res.status(400).send({ message: "Admin not found" });
      }

      // Verify the OTP
      if (admin.otp !== otp.trim()) {
        return res.status(400).send({ message: "Invalid OTP" });
      }
      if (admin.otpExpire < Date.now()) {
        return res.status(400).send({ message: "expired OTP" });
      }

      // Update the admin's password and clear OTP fields
      admin.password = password;
      admin.otp = null;
      admin.otpExpire = null;

      await admin.save({ validate: true });

      // Exclude password from the response
      const updatedAdmin = await models.Admin.findByPk(admin.id, {
        attributes: {
          exclude: ["password"],
        },
      });

      return res.status(200).json({
        success: true,
        message: `Password updated for ${updatedAdmin.email}`,
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
      const admin = await models.Admin.findOne({
        where: {
          phone: phone.trim(),
        },
      });

      if (!admin) {
        return res.status(404).send({ message: "Admin not found" });
      }

      const otp = generateOtp();
      admin.otp = otp;
      admin.otpExpire = Date.now() + 15 * 60 * 1000;

      await admin.save({ validate: false });

      const message = `Your One Time Password (OTP) is ${otp}`;
      try {
        await sendEmail({
          email: admin.email,
          subject: `One-Time Password (OTP) for Verification`,
          message,
        });

        res.status(200).json({
          success: true,
          message: `OTP sent to ${admin.email} successfully`,
          email: admin.email,
          adminId: admin.id,
        });
      } catch (emailError) {
        admin.otp = null;
        admin.otpExpire = null;
        await admin.save({ validate: false });

        console.error("Failed to send OTP email:", emailError);
        return res.status(500).send(emailError.message);
      }
    } catch (error) {
      return res.status(500).send(error.message);
    }
  };

}

module.exports = new AdminController();
