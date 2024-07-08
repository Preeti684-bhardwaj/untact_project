module.exports = (sequelize, DataTypes) => {
    const Agent = sequelize.define('Agent', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false
        },
        phone: DataTypes.STRING,
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        otp:DataTypes.STRING,
        otpExpire:DataTypes.DATE,
        IsActivated: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        IsEmailVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        IsPhoneVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        emailToken: DataTypes.STRING,
        isJobCompleted:{ //to count the completed job of a agent
            type:DataTypes.BOOLEAN,
            defaultValue:false
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });
    return Agent;
};

