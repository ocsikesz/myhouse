import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildYearComparison, invoiceState } from '../src/lib/yearStats';

test('comparație an curent vs anul trecut, aceeași perioadă', () => {
  const rows = [
    { month: '2025-01', value: 120 },
    { month: '2025-02', value: 100 },
    { month: '2025-11', value: 90 },
    { month: '2026-01', value: 110 },
    { month: '2026-02', value: 80 },
    { month: '2026-03', value: null },
  ];
  const c = buildYearComparison(rows, '2026-03-15');
  assert.equal(c.year, 2026);
  assert.equal(c.points.length, 12);
  assert.deepEqual(c.points[0], { month: 1, current: 110, previous: 120 });
  assert.equal(c.points[10].current, null);
  assert.equal(c.points[10].previous, 90);
  assert.equal(c.totalCurrent, 190);
  assert.equal(c.totalPreviousSamePeriod, 220);
  assert.equal(c.deltaPct, -13.6);
});

test('fără an trecut → fără procent', () => {
  assert.equal(buildYearComparison([{ month: '2026-01', value: 5 }], '2026-02-01').deltaPct, null);
});

test('starea facturii', () => {
  assert.equal(invoiceState({ paid: 1, unpaid: 0, due_date: '2026-01-01' }, '2026-10-26'), 'paid');
  assert.equal(invoiceState({ paid: 0, unpaid: 50, due_date: '2026-10-20' }, '2026-10-26'), 'overdue');
  assert.equal(invoiceState({ paid: 0, unpaid: 50, due_date: '2026-11-20' }, '2026-10-26'), 'due');
  assert.equal(invoiceState({ paid: 0, unpaid: 0, due_date: null }, '2026-10-26'), 'paid');
});
