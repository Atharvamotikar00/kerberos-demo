const crypto = require('crypto');

function randomBytes(n) {
  return crypto.randomBytes(n);
}

function toB64(buf) {
  return Buffer.from(buf).toString('base64');
}

function fromB64(b64) {
  return Buffer.from(b64, 'base64');
}

module.exports = { randomBytes, toB64, fromB64 };
