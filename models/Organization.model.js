module.exports = (sequelize, DataTypes) => {
    const Organization = sequelize.define('Organization', {
        id: {
            type: DataTypes.UUID,
            primaryKey: true,
            defaultValue: DataTypes.UUIDV4
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false
        },
        phone: DataTypes.STRING,
        type:DataTypes.STRING,
        description:DataTypes.TEXT,
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        place:DataTypes.STRING,
        emailToken: DataTypes.STRING,
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });
    return Organization;
};

