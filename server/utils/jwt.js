const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';
const DEFAULT_EXPIRES_IN = '7d';

function signJwt(payload, expiresIn = DEFAULT_EXPIRES_IN) {
  return jwt.sign(payload, SECRET, { expiresIn });
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

module.exports = {
  signJwt,
  verifyJwt
};
