const db = require('../config/db.config.js');
const JobCardModel = require('./JobCard.model.js');
const OrganizationModel = require('./Organization.model.js');

const models = {
    Agent:require('./Agent.model.js')(db.sequelize, db.Sequelize.DataTypes),
    Admin:require('./Admin.model.js')(db.sequelize, db.Sequelize.DataTypes),
    Organization:require('./Organization.model.js')(db.sequelize, db.Sequelize.DataTypes),
    JobCard:require('./JobCard.model.js')(db.sequelize, db.Sequelize.DataTypes),
    // Event: require('./event.model')(db.sequelize, db.Sequelize.DataTypes),
    // ExhibitorBrand: require('./exhibitorBrand.model')(db.sequelize, db.Sequelize.DataTypes),
    // Conference: require('./conference.model')(db.sequelize, db.Sequelize.DataTypes),
    // ConferenceTrack: require('./conferenceTrack.model')(db.sequelize, db.Sequelize.DataTypes),
    // ConferenceTalk: require('./conferenceTalk.model')(db.sequelize, db.Sequelize.DataTypes),
    // Workshop: require('./workshop.model')(db.sequelize, db.Sequelize.DataTypes),
    // Product: require('./product.model')(db.sequelize, db.Sequelize.DataTypes),
    // Executive: require('./executive.model')(db.sequelize, db.Sequelize.DataTypes),
    // ExecutiveAssigned: require('./executiveAssigned.model')(db.sequelize, db.Sequelize.DataTypes)

};

// Define relationships

models.Organization.hasMany(models.JobCard, { as: 'jobCards' });
models.JobCard.belongsTo(models.Organization,{foreignKey:'organizationId' , as : 'organization'});

models.Admin.hasMany(models.JobCard,{as:'jobCardsByAdmin'});
models.JobCard.belongsTo(models.Admin,{foreignKey:'adminId' , as : 'admin'})
// models.Event.hasMany(models.ExhibitorBrand, { as: 'ExhibitorBrands' });
// models.ExhibitorBrand.belongsTo(models.Event);

// models.Event.hasMany(models.Conference, { as: 'Conferences' });
// models.Conference.belongsTo(models.Event);

// models.Conference.hasMany(models.ConferenceTrack, { as: 'ConferenceTracks' });
// models.ConferenceTrack.belongsTo(models.Conference);

// models.ConferenceTrack.hasMany(models.ConferenceTalk, { as: 'ConferenceTalks' });
// models.ConferenceTalk.belongsTo(models.ConferenceTrack);

// models.Event.hasMany(models.Workshop, { as: 'Workshops' });
// models.Workshop.belongsTo(models.Event);

// models.Executive.hasMany(models.ExecutiveAssigned);
// models.ExecutiveAssigned.belongsTo(models.Executive);

// const Event_ExecutiveAssigned = db.sequelize.define('Event_ExecutiveAssigned', {}, { timestamps: false });
// models.Event.belongsToMany(models.ExecutiveAssigned, { through: Event_ExecutiveAssigned });
// models.ExecutiveAssigned.belongsToMany(models.Event, { through: Event_ExecutiveAssigned });

//const Executive_ExecutiveAssigned = db.sequelize.define('Executive_ExecutiveAssigned', {}, { timestamps: false });
//models.Executive.belongsToMany(models.ExecutiveAssigned, { through: Executive_ExecutiveAssigned });
//models.ExecutiveAssigned.belongsToMany(models.Executive, { through: Executive_ExecutiveAssigned });

// const ConferenceTalk_ExecutiveAssigned = db.sequelize.define('ConferenceTalk_ExecutiveAssigned', {}, { timestamps: false });
// models.ConferenceTalk.belongsToMany(models.ExecutiveAssigned, { through: ConferenceTalk_ExecutiveAssigned });
// models.ExecutiveAssigned.belongsToMany(models.ConferenceTalk, { through: ConferenceTalk_ExecutiveAssigned });

// const Workshop_ExecutiveAssigned = db.sequelize.define('Workshop_ExecutiveAssigned', {}, { timestamps: false });
// models.Workshop.belongsToMany(models.ExecutiveAssigned, { through: Workshop_ExecutiveAssigned });
// models.ExecutiveAssigned.belongsToMany(models.Workshop, { through: Workshop_ExecutiveAssigned });

// const ExhibitorBrand_ExecutiveAssigned = db.sequelize.define('ExhibitorBrand_ExecutiveAssigned', {}, { timestamps: false });
// models.ExhibitorBrand.belongsToMany(models.ExecutiveAssigned, { through: ExhibitorBrand_ExecutiveAssigned });
// models.ExecutiveAssigned.belongsToMany(models.ExhibitorBrand, { through: ExhibitorBrand_ExecutiveAssigned });

models.db = db;
module.exports = models;

