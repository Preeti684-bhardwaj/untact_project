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
        type:DataTypes.STRING,
        description:DataTypes.TEXT,
        location:DataTypes.STRING,
        contact_person_name:DataTypes.STRING,
        email: {
            type: DataTypes.STRING,
            allowNull: false
        },
        phone: DataTypes.STRING,
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        emailToken: DataTypes.STRING,
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });
    return Organization;
};

