const { getPublicConfig } = require('../config');

function registerConfigRoute(app) {
  app.get('/api/config', (_req, res) => {
    res.json(getPublicConfig());
  });
}

module.exports = { registerConfigRoute };
