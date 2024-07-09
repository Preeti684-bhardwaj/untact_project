module.exports = (sequelize, DataTypes) => {
    const Jobpost = sequelize.define('JobPost', {
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
        jobCards:DataTypes.JSON,
        priority: DataTypes.ENUM('Low','Medium','High'),
        due_date:DataTypes.DATE,
        status:{
            type:DataTypes.ENUM('Open','Ongoing','Completed'),
            defaultValue:'Open'
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });

    return Jobpost;
};

