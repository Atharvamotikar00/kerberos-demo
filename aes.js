// Real authenticated encryption for every "encrypted with key X" step in the
// protocol (RFC 4120 is encryption-type agnostic; historically DES-CBC-MD5 or
// AES-CTS-HMAC, here modernized to AES-256-GCM so both confidentiality *and*
// integrity are genuinely enforced -- a bad key or tampered ciphertext throws
// a real authentication-tag-mismatch error, not a scripted rejection).

const crypto = require('crypto');
const { toB64, fromB64, randomBytes } = require('./util');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function encrypt(keyBuffer, plaintextObj) {
  const iv = randomBytes(IV_LEN);
  const plaintext = Buffer.from(JSON.stringify(plaintextObj), 'utf8');
  const cipher = crypto.createCipheriv(ALGO, keyBuffer, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: toB64(iv), ciphertext: toB64(ciphertext), tag: toB64(tag) };
}

// Throws a genuine crypto error (auth tag mismatch) on wrong key or any
// tampering with iv/ciphertext/tag. Callers must catch this -- there is no
// separate "is this valid" check, the decryption itself is the check.
function decrypt(keyBuffer, blob) {
  const iv = fromB64(blob.iv);
  const ciphertext = fromB64(blob.ciphertext);
  const tag = fromB64(blob.tag);
  const decipher = crypto.createDecipheriv(ALGO, keyBuffer, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = { encrypt, decrypt, IV_LEN };
