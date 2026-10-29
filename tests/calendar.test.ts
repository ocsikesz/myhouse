import assert from 'node:assert/strict';
import { test } from 'node:test';

import { monthGrid } from '../src/lib/calendar';

test('calendar: octombrie 2026 începe joi, 31 de zile, săptămâni de 7', () => {
  const w = monthGrid('2026-10');
  assert.ok(w.every((row) => row.length === 7));
  // 1 octombrie 2026 e joi → 3 celule goale (L, Ma, Mi)
  assert.deepEqual(w[0].slice(0, 4).map((c) => c.day), [null, null, null, 1]);
  const days = w.flat().filter((c) => c.date);
  assert.equal(days.length, 31);
  assert.equal(days[30].date, '2026-10-31');
});

test('calendar: februarie 2026 (28 de zile, începe duminică)', () => {
  const w = monthGrid('2026-02');
  assert.equal(w[0][6].date, '2026-02-01');
  assert.equal(w.flat().filter((c) => c.date).length, 28);
});
