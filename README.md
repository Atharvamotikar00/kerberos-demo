# Kerberos v5 — Interactive Protocol Demo

A live, in-browser walkthrough of the Kerberos v5 authentication protocol
(RFC 4120), with **real cryptography end-to-end**: actual AES-256-GCM
ciphertext, actual PBKDF2 key derivation, actual separate backend services
talking over real HTTP requests, and actual cryptographic failures (wrong
password, expired ticket, replayed authenticator, tampered ciphertext) —
nothing is scripted or faked.

> ⚠️ **This is an educational simulation of the protocol's logic**
> (single realm, simplified pre-authentication, in-memory principal
> database). It is **not** a hardened, production-grade KDC. Don't use it
> to actually protect anything.

## Quick start

Requires only Node.js 18+ (no `npm install` needed — everything uses Node's
built-in `http`/`crypto` modules and the browser's native Web Crypto API,
zero third-party dependencies).

```bash
node server.js
```

Then open **http://localhost:4000** in a browser. Register a test principal,
switch to "Run the protocol", and step through AS-REQ → AS-REP → TGS-REQ →
TGS-REP → AP-REQ → AP-REP. Once a full session is established, the
"Failure demos" panel unlocks so you can trigger real rejections.

Change the port with `PORT=8080 node server.js`.

## What's actually real here

- **Symmetric encryption**: every "encrypted with key X" step is AES-256-GCM,
  via Node's `crypto` module server-side and `window.crypto.subtle`
  client-side. A wrong key or a single tampered byte causes a genuine
  authentication-tag-mismatch exception — there is no `if (password ===
  stored) { ... } else { return "wrong password" }` anywhere.
- **Key derivation**: principal long-term keys are PBKDF2-HMAC-SHA256 over
  the password + a random per-principal salt (100,000 iterations), computed
  identically on both the server (registration/AS) and the browser (login),
  so the two sides only agree on a key when the password actually matches.
- **Separate services, separate keys, real network hops**: the
  Authentication Server, Ticket Granting Server, and Application Server are
  separate route modules that each hold only the keys they're entitled to
  (see Architecture below), and the browser talks to them via real `fetch()`
  HTTP requests — not in-process function calls.
- **Ticket lifetimes and replay protection**: TGTs and service tickets carry
  real expiry timestamps that are checked on every use; each server keeps a
  replay cache and rejects an authenticator it has already seen.

## Architecture

```
public/                    Browser-side "Client" — plain HTML/CSS/JS, ES
                            modules, zero build step. Uses Web Crypto API
                            only. Has no import path to any server secret.
server.js                  Dependency-free Node http server: routes API
                            calls to the three protocol modules, serves
                            static files for everything else.
src/
  secrets.js                Startup-generated keys simulating out-of-band
                             keytab distribution (krbtgt key, app-server key).
  crypto/
    kdf.js                  PBKDF2 password -> long-term key derivation.
    aes.js                  AES-256-GCM encrypt/decrypt helpers.
  kdc/
    db.js                   In-memory principal database (client keys).
    as.js                   Authentication Server: registration, AS-REQ
                             (2 rounds: salt discovery + pre-auth), AS-REP.
    tgs.js                  Ticket Granting Server: TGS-REQ / TGS-REP,
                             replay cache, ticket-lifetime + skew checks.
  appServer/
    appServer.js             Application Server: AP-REQ / AP-REP, mutual
                              auth, its own independent replay cache.
```

**Key custody, matching real Kerberos:**
- The **client** (browser) only ever derives a key from a password it was
  typed, or unwraps a key that a legitimate response handed it. It never
  sees the TGS's key, the app-server's key, or any other principal's key.
- The **AS and TGS** share one principal database and the `krbtgt` /
  app-server keys — in real deployments they're literally the same daemon
  (`krb5kdc`) reading one database, which is why `secrets.js` is imported by
  both `kdc/as.js` (to seal the TGT) and `kdc/tgs.js` (to seal service
  tickets and to open TGTs).
- The **Application Server** only imports its own key (`APP_SERVER_KEY`) —
  it has no path to the KDC's database or the krbtgt key, exactly like a
  real Kerberized service with just its own keytab entry.

## Protocol flow → RFC 4120 mapping

| Step | RFC 4120 section | What happens here |
|---|---|---|
| Registration | §3.1.1 (string-to-key) — out of band | `POST /api/as/register`: PBKDF2(password, salt) stored as the principal's long-term key. |
| AS-REQ (round 1) | §5.2.7.2, PA-ETYPE-INFO2 | `POST /api/as/request-init`: client learns the salt/KDF params needed to re-derive its key. |
| AS-REQ (round 2) | §5.2.7.2, PA-ENC-TIMESTAMP | `POST /api/as/authenticate`: client proves it knows the password by encrypting a timestamp with its derived key. **This is where a wrong password fails — genuinely, via AES-GCM auth-tag mismatch.** |
| AS-REP | §5.4.2 | Returns a TGT (sealed with the TGS's key, opaque to the client) + an encrypted part (sealed with the client's key, containing the new session key). |
| TGS-REQ | §5.4.1 | `POST /api/tgs/request`: client forwards the TGT plus a fresh authenticator (timestamp encrypted with the AS-issued session key). |
| TGS-REP | §5.4.2 | Returns a service ticket (sealed with app-server's key) + an encrypted part (sealed with the TGS session key) carrying a new session key for the app server. |
| AP-REQ | §5.5.1 | `POST /api/app-server/request`: client forwards the service ticket plus a fresh authenticator sealed with the app-server session key. |
| AP-REP | §5.5.2 | Mutual authentication: app-server echoes the client's timestamp back, encrypted with the shared session key, proving it really could open the ticket. |
| Clock skew | §5.2.7.2 | ±5 minute tolerance window on every authenticator timestamp. |
| Replay detection | §3.2.3 | Each of TGS and app-server keeps its own cache of authenticator ciphertexts already seen, and rejects a repeat. |

Every server-side handler function has an inline comment pointing back to
the relevant RFC 4120 section — see `src/kdc/as.js`, `src/kdc/tgs.js`, and
`src/appServer/appServer.js`.

## Design notes / simplifications

- **Pre-authentication is always on.** Real Kerberos supports an optional
  no-pre-auth mode (where a bad password instead causes the client to fail
  to decrypt the AS-REP). This demo always requires PA-ENC-TIMESTAMP, which
  is both the modern default and the point in the real protocol built
  specifically to catch a bad password with a genuine cryptographic check.
- **`debugForceExpiredTicket`** (used by the "Expired service ticket" demo
  button) is a clearly-labeled, demo-only field on the TGS-REQ body — it is
  **not** part of the real Kerberos wire protocol. It exists purely so a
  learner can see the Application Server's real, unmodified expiry check
  reject a ticket without having to wait around for one to actually expire.
- **Single realm, in-memory state.** No cross-realm referrals, no renewable
  tickets, no PKINIT, no persistent storage — restarting the server wipes
  all registered principals and replay caches.
- **AES-256-GCM** is used everywhere instead of the RFC's historical
  DES/3DES/AES-CTS-HMAC encryption types. RFC 4120 is deliberately
  encryption-type-agnostic; GCM was chosen here as a modern AEAD cipher that
  gives genuine confidentiality *and* integrity in one step.
