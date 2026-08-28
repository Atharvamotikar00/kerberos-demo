// Browser-side crypto for the "Client" role in this demo.
// Uses ONLY the native Web Crypto API (window.crypto.subtle) -- this file
// has no import path to any server-side secret key. Everything the client
// knows, it either typed (the password) or received over the wire.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(bytes) {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function unb64(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// PBKDF2(password, salt) -> AES-256-GCM CryptoKey. This is the exact same
// derivation the AS performs server-side (Node's crypto.pbkdf2Sync with the
// same iteration count / hash), so both sides land on the identical key
// bytes when given the same password + salt.
export async function deriveKey(password, saltB64, iterations) {
  const salt = unb64(saltB64);
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function importRawKey(rawKeyB64) {
  return crypto.subtle.importKey('raw', unb64(rawKeyB64), 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export async function exportRawKeyB64(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return b64(raw);
}

// Encrypts a JS object as AES-256-GCM, returning the {iv, ciphertext, tag}
// wire format shared with the Node backend (WebCrypto appends a 16-byte tag
// to the ciphertext internally; we split it back out here).
export async function encryptJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = enc.encode(JSON.stringify(obj));
  const ctWithTag = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, pt);
  const ctBytes = new Uint8Array(ctWithTag);
  const ciphertext = ctBytes.slice(0, ctBytes.length - 16);
  const tag = ctBytes.slice(ctBytes.length - 16);
  return { iv: b64(iv), ciphertext: b64(ciphertext), tag: b64(tag) };
}

// Decrypts our {iv, ciphertext, tag} wire format. Throws a genuine
// OperationError from the browser's crypto engine on any tamper or wrong key
// -- this is a real cryptographic failure, not a simulated one.
export async function decryptJson(key, blob) {
  const iv = unb64(blob.iv);
  const ciphertext = unb64(blob.ciphertext);
  const tag = unb64(blob.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, combined);
  return JSON.parse(dec.decode(pt));
}
