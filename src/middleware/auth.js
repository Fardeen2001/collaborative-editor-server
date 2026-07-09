const { verifyToken } = require('../utils/jwt');
const { AppError } = require('../utils/errors');
const { config } = require('../config');

function authenticate(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }

  try {
    const token = header.slice(config.jwt.bearerPrefixLength);
    req.user = verifyToken(token);
    return next();
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }
}

module.exports = { authenticate };
