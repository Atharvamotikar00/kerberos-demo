// In-memory principal database, mirroring the krb5kdc principal database:
// maps a client principal name to its long-term secret key material
// (the PBKDF2 salt, and the derived key itself).

const principals = new Map(); // username -> { salt: Buffer, key: Buffer }

function registerPrincipal(username, salt, key) {
  principals.set(username, { salt, key });
}

function getPrincipal(username) {
  return principals.get(username);
}

function hasPrincipal(username) {
  return principals.has(username);
}

module.exports = { registerPrincipal, getPrincipal, hasPrincipal };
