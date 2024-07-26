module.exports = (sequelize, DataTypes) => {
  const Jobcard = sequelize.define("JobCard", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    job_title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    job_description: DataTypes.TEXT,
    customerDetail: DataTypes.JSON,
    priority: DataTypes.ENUM("Low", "Medium", "High"),
    due_date: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM("Open", "Ongoing", "Completed"),
      defaultValue: "Open",
    },
    // startTime: DataTypes.STRING,
    // endTime:DataTypes.STRING,
    isAssigned: { type: DataTypes.BOOLEAN, defaultValue: false },
    feedBackInfo: DataTypes.STRING,
    lastUpdatedByAdmin: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    lastUpdatedByAgent: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  });

  return Jobcard;
};
