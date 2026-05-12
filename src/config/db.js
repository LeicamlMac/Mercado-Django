const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'sgvbd',
  password: '12120612',
  port: 5432,
});

module.exports = pool;