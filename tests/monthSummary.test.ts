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
