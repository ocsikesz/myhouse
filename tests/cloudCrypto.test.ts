import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decryptJson, deriveFamilyKey, encryptJson } from '../src/cloud/crypto';

test('parolele furnizorilor: criptare și decriptare cu cheia familiei', async () => {
  const key = await deriveFamilyKey('parola-familiei', 'user-1');
  assert.equal(key.length, 64);
  assert.equal(await deriveFamilyKey('parola-familiei', 'user-1'), key);
  const nonce = new Uint8Array(12).map((_, i) => i + 1);
  const enc = encryptJson(key, { email: 'a@b.ro', password: 'secret' }, nonce);
  assert.ok(enc.startsWith('v1:'));
  assert.ok(!enc.includes('secret'));
  assert.deepEqual(decryptJson(key, enc), { email: 'a@b.ro', password: 'secret' });
  // Altă parolă de familie → nu se poate decripta
  const other = await deriveFamilyKey('alta', 'user-1');
  assert.throws(() => decryptJson(other, enc));
});
