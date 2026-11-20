// Generates the daily reminder's VAPID keys, once per instance (docs/deploiement.md):
//   node scripts/vapid-keys.ts
// The public key goes in the variable VAPID_PUBLIC_KEY, the private one in the secret VAPID_PRIVATE_KEY. Changing
// them later turns every member's reminder off: each turns it on again from Réglages.

import { webcrypto } from 'node:crypto';

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
// The P-256 public point, uncompressed (65 bytes): what browsers subscribe with.
const publicKey = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
const { d: privateKey } = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
if (!privateKey) throw new Error('The private key has no d.');
console.log(`VAPID_PUBLIC_KEY=${base64Url(publicKey)}\nVAPID_PRIVATE_KEY=${privateKey}`);
