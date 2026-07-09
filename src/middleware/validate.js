const { z } = require('zod');

function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(', ');
      const err = new Error(message);
      err.statusCode = 400;
      return next(err);
    }
    req.body = result.data;
    return next();
  };
}

function validateParams(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(', ');
      const err = new Error(message);
      err.statusCode = 400;
      return next(err);
    }
    req.params = result.data;
    return next();
  };
}

module.exports = { validateBody, validateParams };
