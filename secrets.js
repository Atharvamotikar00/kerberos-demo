// Simulates the out-of-band keytab distribution that happens in a real
// Kerberos deployment (an admin runs `kadmin ktadd` for krbtgt/REALM and for
// each service principal, generating long-term keys BEFORE any protocol
// traffic occurs). These keys live only in server-side process memory. They
// are never serialized into any HTTP response, and the browser-side "client"
// code in public/js has no path to import them.
//
// - KRBTGT_KEY belongs to the krbtgt/REALM principal, i.e. the TGS itself.
//   The Authentication Server also needs it because in a real KDC, AS and TGS
//   are the same daemon (krb5kdc) sharing one principal database -- the AS
//   is the party that actually stamps out the TGT using this key.
// - APP_SERVER_KEY belongs to the "app-server" service principal. The TGS
//   needs it for the same database-sharing reason (to build service tickets
//   for that service); the Application Server module also holds its own copy
//   (its "keytab"), independently, exactly as a real app server would.

const crypto = require('crypto');

const KRBTGT_KEY = crypto.randomBytes(32);
const APP_SERVER_KEY = crypto.randomBytes(32);

module.exports = { KRBTGT_KEY, APP_SERVER_KEY };
