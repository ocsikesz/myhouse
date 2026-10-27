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

import { buildMonthBreakdown } from '../src/lib/yearStats';

test('defalcare pe luni: consum, index, facturat, plătit', () => {
  const rows = buildMonthBreakdown(
    2026,
    [
      { month: '2025-12', consumption: 90, index_value: 1000 },
      { month: '2026-01', consumption: 100, index_value: 1100 },
      { month: '2026-02', consumption: 80, index_value: null },
    ],
    [
      { issue_date: '2026-01-10', due_date: '2026-01-30', amount: 250.5, unpaid: 0, paid: 1 },
      { issue_date: '2026-02-10', due_date: '2026-02-28', amount: 200, unpaid: 200, paid: 0 },
      { issue_date: '2025-12-10', due_date: null, amount: 999, unpaid: 0, paid: 1 },
    ],
    [{ paid_on: '2026-01-20', amount: 250.5 }, { paid_on: '2026-03-02', amount: 50 }],
  );
  assert.deepEqual(rows.map((r) => r.month), ['2026-03', '2026-02', '2026-01']);
  assert.deepEqual(rows[2], { month: '2026-01', index: 1100, consumption: 100, billed: 250.5, unpaid: 0, paid: 250.5 });
  assert.equal(rows[1].unpaid, 200);
  assert.equal(rows[0].paid, 50);
});

import { invoiceIndexDelta } from '../src/lib/yearStats';

test('diferența de index pe factură: E.ON (aceeași lună), estimat și regularizare', () => {
  const monthly = [
    { month: '2026-02', index_value: 10758, reading_type: 'autocitit' },
    { month: '2026-03', index_value: 10956, reading_type: 'autocitit' },
    { month: '2026-08', index_value: 11594, reading_type: 'estimat' },
    { month: '2026-09', index_value: 11791, reading_type: 'estimat' },
    { month: '2026-10', index_value: 11573, reading_type: 'citit distribuitor' },
  ];
  // Factura din 27.03.2026 → indexul din martie față de februarie: 198 m³
  assert.deepEqual(invoiceIndexDelta('2026-03-27', monthly, 0), { from: 10758, to: 10956, delta: 198, months: 1, estimated: false });
  assert.equal(invoiceIndexDelta('2026-09-25', monthly, 0)!.estimated, true);
  // Regularizarea din octombrie: citirea reală e sub estimarea din septembrie
  assert.equal(invoiceIndexDelta('2026-10-21', monthly, 0)!.delta, -218);
  // Lipsesc lunile aprilie–iulie → diferența acoperă 5 luni
  assert.equal(invoiceIndexDelta('2026-08-28', monthly, 0)!.months, 5);
  assert.equal(invoiceIndexDelta('2026-04-30', monthly, 0), null);
  assert.equal(invoiceIndexDelta(null, monthly, 0), null);
});

test('diferența de index pe factură: Electrica (factura în luna următoare)', () => {
  const monthly = [
    { month: '2026-07', index_value: 19674, reading_type: 'citit distribuitor' },
    { month: '2026-08', index_value: null, reading_type: null },
    { month: '2026-09', index_value: 20391, reading_type: 'autocitit' },
  ];
  assert.deepEqual(invoiceIndexDelta('2026-10-06', monthly, 1), { from: 19674, to: 20391, delta: 717, months: 2, estimated: false });
});
