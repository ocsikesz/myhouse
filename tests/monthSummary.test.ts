import assert from 'node:assert/strict';
import { test } from 'node:test';

import { kindConsumption, monthCost } from '../src/lib/monthSummary';

test('consum pe tip: luna curentă, adunat pe contoare', () => {
  const r = kindConsumption(
    [
      [{ month: '2026-10', consumption: 40 }, { month: '2026-09', consumption: 30 }],
      [{ month: '2026-10', consumption: 2.5 }],
    ],
    '2026-10',
  );
  assert.deepEqual(r, { value: 42.5, month: '2026-10' });
});

test('consum pe tip: fără date luna asta → ultima lună cu date, nu viitorul', () => {
  const r = kindConsumption(
    [[{ month: '2026-08', consumption: 20 }, { month: '2026-09', consumption: 31 }, { month: '2026-10', consumption: null }, { month: '2026-11', consumption: 99 }]],
    '2026-10',
  );
  assert.deepEqual(r, { value: 31, month: '2026-09' });
});

test('consum pe tip: nimic', () => {
  assert.deepEqual(kindConsumption([], '2026-10'), { value: null, month: null });
});

test('costul lunii: facturile emise în lună + asociația', () => {
  const c = monthCost(
    [
      { provider: 'eon', issue_date: '2026-10-05', due_date: '2026-10-25', amount: 210.4 },
      { provider: 'eon', issue_date: '2026-09-05', due_date: '2026-10-02', amount: 180 },
      { provider: 'electrica', issue_date: null, due_date: '2026-10-28', amount: 99.99 },
    ],
    412.5,
    '2026-10',
  );
  assert.deepEqual(c, { total: 722.89, eon: 210.4, electrica: 99.99, association: 412.5 });
});

import { monthPaid } from '../src/lib/monthSummary';

test('plătit în lună: plăți furnizor, sau facturi plătite când nu există plăți, plus asociația', () => {
  const paid = monthPaid(
    [
      { provider: 'eon', paid_on: '2026-10-12', amount: 210.4 },
      { provider: 'eon', paid_on: '2026-09-12', amount: 180 },
    ],
    [
      { provider: 'eon', issue_date: '2026-10-05', due_date: null, amount: 999, paid: 1 },
      { provider: 'electrica', issue_date: '2026-10-03', due_date: null, amount: 100, paid: 1 },
      { provider: 'electrica', issue_date: '2026-10-20', due_date: null, amount: 50, paid: 0 },
    ],
    { amount: 400, paid_at: '2026-10-20' },
    '2026-10',
  );
  assert.equal(paid, 710.4);
  assert.equal(monthPaid([], [], { amount: 400, paid_at: null }, '2026-10'), 0);
});

import { buildStatement } from '../src/lib/monthSummary';

test('extrasul lunii: consumul din septembrie cu facturile din octombrie și asociația pe septembrie', () => {
  const s = buildStatement({
    month: '2026-09',
    water: [[{ month: '2026-09', consumption: 3 }], [{ month: '2026-09', consumption: 2 }, { month: '2026-10', consumption: 9 }]],
    gas: [[{ month: '2026-08', consumption: 20 }, { month: '2026-09', consumption: 31 }]],
    electricity: [[{ month: '2026-09', consumption: 140 }]],
    gasInvoices: [
      { issue_date: '2026-10-05', due_date: '2026-10-25', amount: 120.5, unpaid: 0, paid: 1 },
      { issue_date: '2026-09-05', due_date: '2026-09-25', amount: 80, unpaid: 0, paid: 1 },
    ],
    electricityInvoices: [{ issue_date: '2026-10-03', due_date: '2026-10-28', amount: 99.99, unpaid: 99.99, paid: 0 }],
    association: { amount: 490, paid_at: '2026-10-27' },
  });
  assert.deepEqual(s.water, { consumption: 5, cost: null, paid: 0 });
  assert.deepEqual(s.gas, { consumption: 31, cost: 120.5, paid: 120.5 });
  assert.deepEqual(s.electricity, { consumption: 140, cost: 99.99, paid: 0 });
  assert.deepEqual(s.association, { consumption: null, cost: 490, paid: 490 });
  assert.equal(s.total, 710.49);
  assert.equal(s.paid, 610.5);
  assert.equal(s.unpaid, 99.99);
});

test('extras: factură încă neemisă → cost necunoscut; decembrie → ianuarie', () => {
  const s = buildStatement({
    month: '2026-12',
    water: [],
    gas: [[{ month: '2026-12', consumption: 60 }]],
    electricity: [],
    gasInvoices: [{ issue_date: '2027-01-04', due_date: null, amount: 300, unpaid: 100, paid: 0 }],
    electricityInvoices: [],
    association: null,
  });
  assert.deepEqual(s.gas, { consumption: 60, cost: 300, paid: 200 });
  assert.deepEqual(s.electricity, { consumption: null, cost: null, paid: 0 });
  assert.equal(s.total, 300);
  assert.equal(s.unpaid, 100);
});
