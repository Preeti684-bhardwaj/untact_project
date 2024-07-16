const jwt = require('jsonwebtoken');
const models = require('../models');
const bcrypt = require('bcrypt');
const User = models.Executive;
const db = models.db;

// Function to send a verification email
async function sendVerificationEmail(email, verificationLink) {
    // Implementation to send the verification link via email
    // Use your email service provider's API to send the email
}

const { body } = require('express-validator');

exports.signupWithEmailValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address.'),
];

exports.signinWithEmailValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address.'),
];

exports.signupWithEmail = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Hash the password with bcrypt
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        let user = await User.findOne({ where: { email } });

        if (!user) {
            user = await User.create({
                email,
                password: passwordHash,
                emailVerified: false
            });
            // Initiate the email verification process here...
        }

        // Respond with appropriate message
        res.status(200).json({
            message: "User signed up successfully. Please check your email to verify your account.",
            userId: user.id,
            email: user.email
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Signup failed",
            error: error.message
        });
    }
};

exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.query;
        const user = await User.findOne({ where: { verificationToken: token } });

        if (!user) {
            // Render the error template with a custom error message
            return res.status(400).render('verification-error', {
                error: 'Invalid or expired verification link.'
            });
        }

        await user.update({ emailVerified: true, verificationToken: null });

        // Render the email verification success template
        res.render('email-verified');
    } catch (error) {
        console.error(error);
        // Render the error template with a custom error message for unexpected errors
        res.status(500).render('verification-error', {
            error: 'An unexpected error occurred during email verification.'
        });
    }
};


exports.signinWithEmail = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.emailVerified) {
            return res.status(401).json({ message: "Email not verified" });
        }

        // Compare the provided password with the stored hash
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid password" });
        }

        // Proceed to generate the token and send the response
        // Token generation logic here...
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Signin failed",
            error: error.message
        });
    }
};

// middleware/auth.middleware.js

exports.authenticate = (req, res, next) => {
    try {
    const token = req.headers['authorization'];
console.log(token);
    if (!token) {
        return res.status(401).send({ message: 'No token provided.' });
    }

    let decoded =jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.obj.id;
        req.userType = decoded.obj.type;
        console.log(req.userType);
        next();
} catch (error) {
    if (error.message == "Invalid token") {
      return res
        .status(401)
        .send({ status: false, message: "Enter valid token" });
    }
    return res.status(500).send({ status: false, message: error.message });
  }
};

exports.authorizeAdmin = async (req, res, next) => {
    const id = req.userId;
    const type=req.userType;
try{
    if (type === 'ADMIN') {
        const admin = await models.Admin.findByPk(id);

        if (!admin) {
            return res.status(403).send({ message: 'You are not authorized to access this resource.' });
        }
        // If user is an admin, proceed
        return next();
    }
    } catch (error) {
        res.status(500).send({ message: error.message || 'An error occurred during authorization.' });
    }
};

exports.authorizeAdminOrOrganization = async (req, res, next) => {
    const id = req.userId;
    const type=req.userType;

    if (type === 'ADMIN') {
        const admin = await models.Admin.findByPk(req.userId);

        if (!admin) {
            return res.status(403).send({ message: 'You are not authorized to access this resource.' });
        }
        // If user is an admin, proceed
        return next();
    }

    if (type === 'ORGANIZATION') {
        // Check if the user is part of the organization
        const organization = await models.Organization.findByPk(id);
        if (organization) {
            return next();
        }
    }

    return res.status(403).json({ error: 'Not authorized' });
};


