// Application Server module — RFC 4120 §3.4 (Client/Server Exchange, AP-REQ/AP-REP).
//
// Holds only its OWN long-term key (its "keytab"). It has no access to the
// KDC's principal database, the krbtgt key, or any client's password-derived
// key -- exactly like a real Kerberized service.

const aes = require('../crypto/aes');
const { APP_SERVER_KEY } = require('../secrets');

const SKEW_MS = 5 * 60 * 1000;
const seenAuthenticators = new Set(); // independent replay cache from the TGS's

function request(body) {
  const { serviceTicket, authenticator } = body || {};

  let ticketPayload;
  try {
    ticketPayload = aes.decrypt(APP_SERVER_KEY, serviceTicket);
  } catch (e) {
    return { status: 401, body: { error: 'KRB_AP_ERR_MODIFIED', message: 'Service ticket failed integrity check (corrupt, forged, or tampered).' } };
  }

  if (Date.now() > ticketPayload.expiryTime) {
    return { status: 401, body: { error: 'KRB_AP_ERR_TKT_EXPIRED', message: 'The service ticket has expired; the client must request a fresh one from the TGS.' } };
  }

  const sessionKey = Buffer.from(ticketPayload.sessionKey, 'base64');
  let authPayload;
  try {
    authPayload = aes.decrypt(sessionKey, authenticator);
  } catch (e) {
    return { status: 401, body: { error: 'KRB_AP_ERR_BAD_INTEGRITY', message: 'Authenticator failed integrity check (tampered ciphertext or wrong session key).' } };
  }

  if (authPayload.username !== ticketPayload.username) {
    return { status: 401, body: { error: 'KRB_AP_ERR_BADMATCH', message: 'Authenticator principal does not match the service ticket principal.' } };
  }

  const ts = new Date(authPayload.timestamp).getTime();
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SKEW_MS) {
    return { status: 401, body: { error: 'KRB_AP_ERR_SKEW', message: 'Authenticator timestamp is outside the allowed clock-skew window.' } };
  }

  const replayKey = `${ticketPayload.username}|${authenticator.ciphertext}`;
  if (seenAuthenticators.has(replayKey)) {
    return { status: 401, body: { error: 'KRB_AP_ERR_REPEAT', message: 'This authenticator has already been used once (replay detected).' } };
  }
  seenAuthenticators.add(replayKey);

  // Mutual authentication (RFC 4120 §5.5.2): prove WE could decrypt the
  // ticket by echoing the client's own timestamp back, encrypted with the
  // session key. Only a party that legitimately holds the session key
  // (i.e. genuinely is app-server) could produce this.
  const apRep = aes.encrypt(sessionKey, { timestamp: authPayload.timestamp });

  return { status: 200, body: { apRep, username: ticketPayload.username } };
}

module.exports = { request };
