module.exports = (sequelize, DataTypes) => {
    const Agent = sequelize.define('Agent', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        name:DataTypes.STRING,
        email: {
            type: DataTypes.STRING,
            allowNull: false
        },
        countryCode:DataTypes.TEXT,
        phone: DataTypes.STRING,
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        otp:DataTypes.STRING,
        otpExpire:DataTypes.DATE,
        IsActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        isEmailVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        IsPhoneVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        emailToken: DataTypes.STRING,
        startTime:DataTypes.STRING,
        endTime:DataTypes.STRING,
        availableSlots:DataTypes.JSON,
        badgeEarned:DataTypes.INTEGER,
        jobs: DataTypes.JSON,
        jobInHand:DataTypes.INTEGER,
        isJobCompleted:{ //to count the completed job of a agent
            type:DataTypes.BOOLEAN,
            defaultValue:false
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });
    return Agent;
};

