module.exports = (sequelize, DataTypes) => {
    const Admin = sequelize.define('Admin', {
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
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });
    return Admin;
};

