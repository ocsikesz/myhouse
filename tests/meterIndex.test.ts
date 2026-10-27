import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currentIndex } from '../src/lib/meterIndex';

test('indexul curent: autocitirea trimisă, mai nouă decât cel facturat', () => {
  const c = currentIndex({ last_index: 20391, last_index_date: '2026-09-30', submitted_index: 20665, submitted_at: '2026-10-24' });
  assert.deepEqual(c, { value: 20665, date: '2026-10-24', source: 'trimis', billed: { value: 20391, date: '2026-09-30' } });
});

test('indexul curent: după ce e facturat, rămâne cel facturat', () => {
  const c = currentIndex({ last_index: 20665, last_index_date: '2026-10-31', submitted_index: 20665, submitted_at: '2026-10-24T10:00:00Z' });
  assert.equal(c.source, 'facturat');
  assert.equal(c.value, 20665);
  assert.equal(c.billed, null);
});

test('indexul curent: fără nimic trimis / fără nimic facturat', () => {
  assert.equal(currentIndex({ last_index: 100, last_index_date: null, submitted_index: null, submitted_at: null }).source, 'facturat');
  assert.equal(currentIndex({ last_index: null, last_index_date: null, submitted_index: 5, submitted_at: '2026-10-01' }).source, 'trimis');
  assert.equal(currentIndex({ last_index: null, last_index_date: null, submitted_index: null, submitted_at: null }).value, null);
});
