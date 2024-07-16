const db = require('../config/db.config.js');

const models = {
    Agent: require('./Agent.model.js')(db.sequelize, db.Sequelize.DataTypes),
    Admin: require('./Admin.model.js')(db.sequelize, db.Sequelize.DataTypes),
    Organization: require('./Organization.model.js')(db.sequelize, db.Sequelize.DataTypes),
    JobPost: require('./JobPost.model.js')(db.sequelize, db.Sequelize.DataTypes),
    JobCard: require('./JobCard.model.js')(db.sequelize, db.Sequelize.DataTypes),
};

// Define relationships

models.Organization.hasMany(models.JobPost, { as: 'jobPosts' });
models.JobPost.belongsTo(models.Organization);

models.Admin.hasMany(models.JobPost, { as: 'jobPostsByAdmin' });
models.JobPost.belongsTo(models.Admin);

models.JobPost.hasMany(models.JobCard, { as: 'jobCards' });
models.JobCard.belongsTo(models.JobPost);

models.Organization.hasMany(models.JobCard, { as: 'cardsByOrganization' });
models.JobCard.belongsTo(models.Organization);

models.Admin.hasMany(models.JobCard, { as: 'cardsByAdmin' });
models.JobCard.belongsTo(models.Admin);

models.db = db;
module.exports = models;
