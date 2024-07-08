const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const BaseController = require('./base');
const models = require('../models');
const sequelize = require("../config/db.config").sequelize; // Ensure this path is correct
const { authenticate, authorizeAdmin } = require('../controllers/auth');

const generateToken = (organization) => {
    return jwt.sign({ obj: organization }, process.env.JWT_SECRET, {
        expiresIn: '72h', // expires in 72 hours
    });
};

class OrganizationController extends BaseController {
    constructor() {
        super(models.Organization);
        this.router.post('/signup', authenticate, authorizeAdmin, this.signup.bind(this));
        this.router.post('/signin', this.signin.bind(this));
        this.router.get('/verify-email', this.verifyEmail.bind(this));
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
            queryOptions.attributes = queryOptions.attributes.filter(attr => !['password', 'resetToken'].includes(attr));
        } else {
            queryOptions.attributes = { exclude: ['password', 'resetToken'] };
        }

        return queryOptions;
    }

    async afterCreate(req, res, newObject, transaction) {
        // Add additional setup after creating an agent, if necessary
    }

    signup = async (req, res) => {
        const transaction = await sequelize.transaction();
        try {
            const {name,email, phone,type,description,password,place} = req.body;
            const existingUser = await models.Organization.findOne({ where: { email } });

            if (existingUser) {
                return res.status(400).send({ message: "Email is already in use." });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const emailToken = generateToken({ email }); // Token for email verification

            const organization = await models.Organization.create({
                name,
                email,
                phone,
                type,
                description,
                password: hashedPassword,
                place,
                emailToken
            }, { transaction });

            // Optional: Send verification email
            // sendVerificationEmail(email, emailToken);

            await transaction.commit();
            res.status(201).send({
                id: organization.id,
                email: organization.email,
                phone: organization.phone,
            });
        } catch (error) {
            await transaction.rollback();
            res.status(500).send({
                message: error.message || "Some error occurred during signup."
            });
        }
    };

    signin = async (req, res) => {
        const { email, password } = req.body;

        try {
            const organization = await models.Organization.findOne({ where: { email } });
            if (!organization) {
                return res.status(404).send({ message: "Organization not found." });
            }

            const isPasswordValid = await bcrypt.compare(password, organization.password);
            if (!isPasswordValid) {
                return res.status(403).send({ message: "Invalid password." });
            }

            const obj = {
                type: 'ORGANIZATION',
                id: organization.id,
                email: organization.email
            };

            const token = generateToken(obj);

            res.status(200).send({
                id: organization.id,
                token: token
            });

        } catch (error) {
            res.status(500).send({
                message: error.message || "Some error occurred during signin."
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
                message: error.message || "Could not verify email."
            });
        }
    };
}

module.exports = new OrganizationController();
