export const GLOSSARY = {
  realm: 'A Kerberos administrative domain (e.g. DEMO.LOCAL) — like a DNS domain, but for authentication. All principals in this demo belong to one realm.',
  principal: 'An identity known to the KDC — a user (alice@DEMO.LOCAL) or a service (app-server@DEMO.LOCAL). Every principal has its own long-term secret key.',
  kdc: 'Key Distribution Center — the trusted third party. In real deployments the AS and TGS are the same daemon (krb5kdc) sharing one principal database, which is why this demo groups them together.',
  as: 'Authentication Server — verifies who you are (via a password-derived key) and issues a Ticket Granting Ticket.',
  tgs: 'Ticket Granting Server — accepts your TGT and issues short-lived Service Tickets for specific applications, without you ever re-entering your password.',
  tgt: 'Ticket Granting Ticket — a credential proving you authenticated to the AS, encrypted with the TGS\'s own secret key. You can carry it, but you can never open it yourself.',
  serviceTicket: 'A short-lived, service-specific credential encrypted with that service\'s secret key. Presented to the application server to prove who you are.',
  sessionKey: 'A random key minted fresh for one relationship (client↔TGS, or client↔service). Used to encrypt authenticators and to protect the next step\'s response — it is never derived from a password.',
  authenticator: 'A tiny message (your username + the current time) encrypted with a session key, sent alongside a ticket to prove you actually possess that session key right now, not just that you\'re replaying an old ticket.',
  preauth: 'Pre-authentication — before issuing a TGT, the AS requires proof (an encrypted timestamp) that the requester really knows the password, preventing offline password-guessing attacks on a raw AS-REP.',
  clockSkew: 'The small tolerance window (±5 minutes here) allowed between a timestamp inside an authenticator and the server\'s own clock, to accommodate normal clock drift between machines.',
  mutualAuth: 'The final step where the application server proves back to the client that it could decrypt the ticket (by echoing the client\'s timestamp), so the client isn\'t just talking to an impostor server.',
};
