module.exports = (sequelize, DataTypes) => {
    const Assignment = sequelize.define('Assignment', {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        startTime: {
            type: DataTypes.DATE,
            allowNull: false
        },
        endTime: {
            type: DataTypes.DATE,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('Scheduled', 'InProgress', 'Completed', 'Cancelled'),
            defaultValue: 'Scheduled'
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE
    });


    return Assignment;
};