// Authentication Server (AS) module — RFC 4120 §3.1 (AS Exchange).
//
// This demo implements the modern, pre-auth-required flow (RFC 4120 §5.2.7.2,
// PA-ENC-TIMESTAMP) in two HTTP round trips:
//   1. requestInit  — client sends just a username; AS returns the salt/KDF
//      params needed to derive the long-term key from a password (mirrors
//      the PA-ETYPE-INFO2 pre-auth-required error in real Kerberos).
//   2. authenticate — client re-sends with an encrypted-timestamp pre-auth
//      value. The AS decrypts it with the principal's STORED key. If the
//      client derived its key from the wrong password, this decryption
//      genuinely fails (AES-GCM auth tag mismatch) — this is the real point
//      in the protocol where a bad password is caught, and it fails
//      cryptographically, not via a scripted string comparison. Only on
//      success does the AS issue an AS-REP (TGT + encrypted session key).

const crypto = require('crypto');
const db = require('./db');
const { deriveKey, ITERATIONS } = require('./kdf');
const aes = require('../aes');
const { randomBytes, toB64 } = require('../util');
const { KRBTGT_KEY } = require('../secrets');

const REALM = 'DEMO.LOCAL';
const TGT_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours, a typical KDC default max ticket lifetime
const SKEW_MS = 5 * 60 * 1000; // RFC 4120 §5.2.7.2 recommends a small clock-skew tolerance window

// Fixed decoy salt for unknown usernames, so an attacker probing requestInit
// can't distinguish "no such user" from a real salt by response shape.
const DECOY_SALT = crypto.randomBytes(16);

function register(body) {
  const { username, password } = body || {};
  if (!username || !password) {
    return { status: 400, body: { error: 'BAD_REQUEST', message: 'username and password are required' } };
  }
  if (db.hasPrincipal(username)) {
    return { status: 409, body: { error: 'KDC_ERR_PRINCIPAL_EXISTS', message: 'That principal is already registered.' } };
  }
  const salt = randomBytes(16);
  const key = deriveKey(password, salt);
  db.registerPrincipal(username, salt, key);
  return { status: 201, body: { username, realm: REALM } };
}

function requestInit(body) {
  const { username } = body || {};
  const principal = db.getPrincipal(username);
  const salt = principal ? principal.salt : DECOY_SALT;
  return { status: 200, body: { salt: toB64(salt), iterations: ITERATIONS, realm: REALM } };
}

function authenticate(body) {
  const { username, encTimestamp } = body || {};
  const principal = db.getPrincipal(username);

  if (!principal) {
    return { status: 401, body: { error: 'KDC_ERR_C_PRINCIPAL_UNKNOWN', message: 'Unknown client principal.' } };
  }

  let preAuth;
  try {
    preAuth = aes.decrypt(principal.key, encTimestamp);
  } catch (e) {
    return {
      status: 401,
      body: {
        error: 'KRB_AP_ERR_BAD_INTEGRITY',
        message: 'Pre-authentication failed: the encrypted timestamp did not decrypt with this principal\'s stored key (wrong password).',
      },
    };
  }

  const ts = new Date(preAuth.timestamp).getTime();
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SKEW_MS) {
    return { status: 401, body: { error: 'KRB_AP_ERR_SKEW', message: 'Pre-auth timestamp is outside the allowed clock-skew window.' } };
  }

  // Pre-auth succeeded: mint a fresh client<->TGS session key and a TGT.
  const sessionKey = randomBytes(32);
  const now = Date.now();
  const tgtPayload = {
    kind: 'TGT',
    username,
    realm: REALM,
    sessionKey: toB64(sessionKey),
    issueTime: now,
    expiryTime: now + TGT_LIFETIME_MS,
  };

  // TGT is encrypted with the TGS's own key -- the client can carry it around
  // but can never open it.
  const tgt = aes.encrypt(KRBTGT_KEY, tgtPayload);

  // The "encrypted part" of the AS-REP is encrypted with the CLIENT's
  // long-term key, so only someone who knows the password can read the new
  // session key out of it.
  const encPart = aes.encrypt(principal.key, {
    sessionKey: toB64(sessionKey),
    expiryTime: tgtPayload.expiryTime,
    serverName: `krbtgt/${REALM}`,
  });

  return { status: 200, body: { username, realm: REALM, tgt, encPart } };
}

module.exports = { register, requestInit, authenticate, REALM };
