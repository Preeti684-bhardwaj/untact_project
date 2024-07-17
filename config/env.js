const env = {
  database: 'untactserver',
  username: 'untactuser',
  password: 'untactuser123',
  host: 'localhost',
  dialect: 'postgres',
  pool: {
    max: 10, // Increase this if needed
    min: 0,
    acquire: 60000, // Increase to 60 seconds
    idle: 10000
  },
port:5432
};

module.exports = env;
