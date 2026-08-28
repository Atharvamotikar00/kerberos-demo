// RFC 4120 §3.1.1 defines a "string-to-key" function that turns a principal's
// password into their long-term secret key, using an encryption-type-specific
// algorithm (historically DES or 3DES-based) plus a salt (usually derived from
// the principal name/realm). This demo uses PBKDF2-HMAC-SHA256 instead, which
// is the same *role* in the protocol (password -> long-term AES key) but with
// a modern, non-deprecated KDF. The salt itself is generated randomly at
// registration time and stored server-side, mirroring how a real KDC stores
// the salt alongside (or derivable from) each principal's database entry.

const crypto = require('crypto');

const ITERATIONS = 100000;
const KEYLEN = 32; // 32 bytes = AES-256 key
const DIGEST = 'sha256';

function deriveKey(password, saltBuffer) {
  return crypto.pbkdf2Sync(password, saltBuffer, ITERATIONS, KEYLEN, DIGEST);
}

module.exports = { deriveKey, ITERATIONS, KEYLEN, DIGEST };
