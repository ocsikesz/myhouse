import assert from 'node:assert/strict';
import { test } from 'node:test';

import { monthlyConsumption } from '../src/lib/stats';
import { computeTasks, notificationKey, type TaskInput } from '../src/lib/tasks';

const base: TaskInput = {
  today: '2026-10-26',
  providers: [],
  authErrors: [],
  water: { reminderDay: 20, sentThisMonth: false, hasMeters: true },
  association: null,
};

test('fereastră deschisă: notificare la deschidere și în ultima zi', () => {
  const p = { meterId: 'eon:1', name: 'Gaz (E.ON)', unit: 'm³', inWindow: true, windowStart: '2026-10-22', windowEnd: '2026-10-30', submitted: false, lastIndex: 6030, error: null };
  const open = computeTasks({ ...base, providers: [p] }).find((t) => t.key.startsWith('index.'))!;
  assert.equal(open.key, 'index.eon:1.2026-10-22.open');
  assert.equal(open.urgency, 'normal');
  const last = computeTasks({ ...base, today: '2026-10-30', providers: [p] }).find((t) => t.key.startsWith('index.'))!;
  assert.equal(last.key, 'index.eon:1.2026-10-22.last');
  assert.match(last.title, /Azi e ultima zi/);
  assert.equal(computeTasks({ ...base, providers: [{ ...p, submitted: true }] }).filter((t) => t.key.startsWith('index.')).length, 0);
});

test('apă: doar după ziua de reminder și dacă nu s-a trimis', () => {
  assert.ok(computeTasks(base).some((t) => t.url === '/apa'));
  assert.ok(!computeTasks({ ...base, today: '2026-10-10' }).some((t) => t.url === '/apa'));
  assert.ok(!computeTasks({ ...base, water: { ...base.water, sentThisMonth: true } }).some((t) => t.url === '/apa'));
});

test('asociație: notificare doar aproape de scadență', () => {
  const far = computeTasks({ ...base, association: { month: '2026-10', amount: 400, dueDate: '2026-11-15', paid: false } }).find((t) => t.url === '/asociatie')!;
  assert.equal(far.notify, 'never');
  const near = computeTasks({ ...base, association: { month: '2026-10', amount: 400, dueDate: '2026-10-28', paid: false } }).find((t) => t.url === '/asociatie')!;
  assert.equal(near.notify, 'daily');
  assert.equal(notificationKey(near, '2026-10-26'), 'notif:assoc.2026-10:2026-10-26');
  assert.ok(!computeTasks({ ...base, association: { month: '2026-10', amount: 400, dueDate: null, paid: true } }).some((t) => t.url === '/asociatie'));
});

test('consum lunar din index', () => {
  const r = (id: number, value: number, read_at: string) => ({ id, meter_id: 'a', value, read_at, source: 'manual' as const, photo_uri: null, sent_at: null, note: null });
  const res = monthlyConsumption([r(3, 130, '2026-10-20'), r(1, 121, '2026-08-20'), r(2, 125, '2026-09-21')], '2026-10', 4);
  assert.deepEqual(res, [
    { month: '2026-07', value: null },
    { month: '2026-08', value: null },
    { month: '2026-09', value: 4 },
    { month: '2026-10', value: 5 },
  ]);
});

test('facturi neplătite: nouă → o dată, aproape de scadență → zilnic', () => {
  const inv = { meterId: 'eon:1', name: 'Gaz (E.ON)', number: 'F1', unpaid: 234.5, dueDate: '2026-11-15' };
  const far = computeTasks({ ...base, invoices: [inv] }).find((t) => t.key.startsWith('invoice.'))!;
  assert.equal(far.notify, 'once');
  assert.equal(far.key, 'invoice.eon:1.F1');
  const near = computeTasks({ ...base, today: '2026-11-13', invoices: [inv] }).find((t) => t.key.startsWith('invoice.'))!;
  assert.equal(near.notify, 'daily');
  assert.equal(near.urgency, 'urgent');
  const late = computeTasks({ ...base, today: '2026-11-20', invoices: [inv] }).find((t) => t.key.startsWith('invoice.'))!;
  assert.match(late.title, /restantă/);
});
