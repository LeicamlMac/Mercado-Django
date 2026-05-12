const express = require('express');
const app = express();

const prodRoutes = require('./router/router');

app.use(express.json());

app.use('/api', prodRoutes);

module.exports = app; 