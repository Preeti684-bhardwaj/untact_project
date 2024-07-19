module.exports = (sequelize, DataTypes) => {
    const Jobcard = sequelize.define('JobCard', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        job_title: {
            type: DataTypes.STRING,
            allowNull: false
        },
        job_description: DataTypes.TEXT,
        customerDetail:DataTypes.JSON,
        priority: DataTypes.ENUM('Low','Medium','High'),
        due_date:DataTypes.DATE,
        status:{
            type:DataTypes.ENUM('Open','Ongoing','Completed'),
            defaultValue:'Open'
        },
        lastUpdatedBy: DataTypes.UUID, 
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });

    return Jobcard;
};

