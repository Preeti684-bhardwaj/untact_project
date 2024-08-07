const env = {
  database: 'Untact',
  username: 'postgres',
  password: '987654',
  host: 'localhost',
  dialect: 'postgres',
  pool: {
    max: 15,
    min: 0,
    acquire: 90000,
    idle: 30000
  },
port:5432
};

module.exports = env;
