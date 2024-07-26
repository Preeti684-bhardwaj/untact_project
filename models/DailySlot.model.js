module.exports = (sequelize, DataTypes) => {
  const DailySlot = sequelize.define("DailySlot", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    slots: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  });
  return DailySlot;
};
