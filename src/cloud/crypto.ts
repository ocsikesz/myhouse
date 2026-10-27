import { gcm } from '@noble/ciphers/aes';
import { bytesToUtf8 } from '@noble/ciphers/utils';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Criptarea parolelor E.ON / Electrica înainte să plece în cloud.
 * Cheia vine din parola contului de familie (PBKDF2-SHA256), deci nici
 * serverul, nici cineva cu acces la baza de date nu le poate citi.
 * AES-256-GCM: nonce aleator de 12 octeți, pus în fața textului criptat.
 */

const ITERATIONS = 60_000;

export async function deriveFamilyKey(password: string, userId: string): Promise<string> {
  const key = await pbkdf2Async(sha256, utf8ToBytes(password), utf8ToBytes(`casamea:${userId}`), {
    c: ITERATIONS,
    dkLen: 32,
  });
  return bytesToHex(key);
}

export function encryptJson(keyHex: string, value: unknown, nonce: Uint8Array): string {
  if (nonce.length !== 12) throw new Error('Nonce-ul trebuie să aibă 12 octeți');
  const ct = gcm(hexToBytes(keyHex), nonce).encrypt(utf8ToBytes(JSON.stringify(value)));
  return `v1:${bytesToHex(nonce)}${bytesToHex(ct)}`;
}

export function decryptJson<T>(keyHex: string, payload: string): T {
  if (!payload.startsWith('v1:')) throw new Error('Format necunoscut');
  const bytes = hexToBytes(payload.slice(3));
  const plain = gcm(hexToBytes(keyHex), bytes.slice(0, 12)).decrypt(bytes.slice(12));
  return JSON.parse(bytesToUtf8(plain)) as T;
}
