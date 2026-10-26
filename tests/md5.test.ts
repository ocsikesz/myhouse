import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';

import { hmacMd5Hex, md5Hex } from '../src/lib/md5';

const samples = ['', 'a', 'abc', 'ion.popescu@example.ro', 'ăîșțâ – diacritice', 'x'.repeat(55), 'y'.repeat(64), 'z'.repeat(200)];

test('md5 identic cu node:crypto', () => {
  for (const s of samples) assert.equal(md5Hex(s), createHash('md5').update(s, 'utf8').digest('hex'), s);
});

test('hmac-md5 identic cu node:crypto', () => {
  const keys = ['zrAnQjN0bDjlTsKYmbpexjaBNY6wrCzuIqGWNgqoaJzlLrYiqd', 'k', 'k'.repeat(100)];
  for (const key of keys) {
    for (const s of samples) {
      assert.equal(hmacMd5Hex(key, s), createHmac('md5', key).update(s, 'utf8').digest('hex'), `${key}/${s}`);
    }
  }
});
