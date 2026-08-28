// Ticket Granting Server (TGS) module — RFC 4120 §3.3 (TGS Exchange).
//
// Receives a TGT + an authenticator (a timestamp encrypted with the session
// key handed out in the AS-REP). Decrypts the TGT with the TGS's own
// long-term key to recover that session key, uses it to decrypt the
// authenticator, then checks freshness and replay before minting a service
// ticket for the requested application server.

const aes = require('../aes');
const { randomBytes, toB64 } = require('../util');
const { KRBTGT_KEY, APP_SERVER_KEY } = require('../secrets');
const { REALM } = require('./as');

const SKEW_MS = 5 * 60 * 1000;
// Deliberately short so the "expired ticket" failure demo doesn't require
// the user to wait around, and so the effect of debugForceExpiredTicket is
// easy to reason about.
const SERVICE_TICKET_LIFETIME_MS = 5 * 60 * 1000;

// Replay cache: RFC 4120 §3.2.3 requires servers to reject an authenticator
// that has already been seen within the current window. Keyed on the
// authenticator's own ciphertext, which is unique per encryption (fresh IV).
const seenAuthenticators = new Set();

const SERVICES = {
  'app-server': APP_SERVER_KEY,
};

function request(body) {
  const { tgt, authenticator, serviceName, debugForceExpiredTicket } = body || {};

  if (!serviceName || !SERVICES[serviceName]) {
    return { status: 400, body: { error: 'KDC_ERR_S_PRINCIPAL_UNKNOWN', message: 'Unknown service principal.' } };
  }

  let tgtPayload;
  try {
    tgtPayload = aes.decrypt(KRBTGT_KEY, tgt);
  } catch (e) {
    return { status: 401, body: { error: 'KRB_AP_ERR_MODIFIED', message: 'TGT failed integrity check (corrupt, forged, or tampered).' } };
  }

  if (Date.now() > tgtPayload.expiryTime) {
    return { status: 401, body: { error: 'KRB_AP_ERR_TKT_EXPIRED', message: 'The ticket-granting ticket has expired; the client must re-run the AS exchange.' } };
  }

  const sessionKey = Buffer.from(tgtPayload.sessionKey, 'base64');
  let authPayload;
  try {
    authPayload = aes.decrypt(sessionKey, authenticator);
  } catch (e) {
    return { status: 401, body: { error: 'KRB_AP_ERR_BAD_INTEGRITY', message: 'Authenticator failed integrity check (tampered ciphertext or wrong session key).' } };
  }

  if (authPayload.username !== tgtPayload.username) {
    return { status: 401, body: { error: 'KRB_AP_ERR_BADMATCH', message: 'Authenticator principal does not match the TGT principal.' } };
  }

  const ts = new Date(authPayload.timestamp).getTime();
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SKEW_MS) {
    return { status: 401, body: { error: 'KRB_AP_ERR_SKEW', message: 'Authenticator timestamp is outside the allowed clock-skew window.' } };
  }

  const replayKey = `${tgtPayload.username}|${authenticator.ciphertext}`;
  if (seenAuthenticators.has(replayKey)) {
    return { status: 401, body: { error: 'KRB_AP_ERR_REPEAT', message: 'This authenticator has already been used once (replay detected).' } };
  }
  seenAuthenticators.add(replayKey);

  const serviceKey = SERVICES[serviceName];
  const svcSessionKey = randomBytes(32);
  const now = Date.now();
  // debugForceExpiredTicket is a clearly-labeled, demo-only hook (NOT part of
  // the real Kerberos wire protocol) that the UI's "Expired Ticket" failure
  // demo can set, so the Application Server's genuine expiry check has
  // something real to reject.
  const expiryTime = debugForceExpiredTicket ? now - 1000 : now + SERVICE_TICKET_LIFETIME_MS;

  const ticketPayload = {
    kind: 'ServiceTicket',
    username: tgtPayload.username,
    realm: REALM,
    serviceName,
    sessionKey: toB64(svcSessionKey),
    issueTime: now,
    expiryTime,
  };
  const serviceTicket = aes.encrypt(serviceKey, ticketPayload); // opaque to the client, only app-server can open it

  const encPart = aes.encrypt(sessionKey, {
    sessionKey: toB64(svcSessionKey),
    expiryTime,
    serverName: serviceName,
  }); // readable by the client via its TGS session key

  return { status: 200, body: { serviceTicket, encPart } };
}

module.exports = { request };
