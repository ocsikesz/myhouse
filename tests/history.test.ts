import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  electricaReadingsToMonthly,
  parseElectricaHierarchy,
  parseElectricaInvoices,
  parseElectricaReadings,
} from '../src/providers/electrica';
import {
  EonClient,
  parseEonGraphicConsumption,
  parseEonInvoices,
  parseEonMeterHistory,
  parseEonPayments,
} from '../src/providers/eon';
import { historyStart } from '../src/lib/format';

test('E.ON consum lunar și indexuri', () => {
  const c = parseEonGraphicConsumption({
    um: 'm3',
    consumption: [
      { year: 2026, month: 2, consumptionValue: 91.45, consumptionValueDayValue: 3.2 },
      { year: 2026, month: '01', consumptionValue: '124.91' },
      { year: 2026, month: 13, consumptionValue: 1 },
    ],
  });
  assert.deepEqual(c.map((r) => [r.month, r.consumption]), [['2026-01', 124.91], ['2026-02', 91.45]]);

  const h = parseEonMeterHistory({
    history: [{ year: 2026, meters: [{ indexes: [{ readings: [{ month: 3, value: '6030', readingType: '02' }, { month: 4, value: 6105, readingType: '01' }] }] }] }],
  });
  assert.deepEqual(h.map((r) => [r.month, r.index, r.readingType]), [['2026-03', 6030, 'autocitit'], ['2026-04', 6105, 'citit distribuitor']]);
});

test('E.ON facturi și plăți', () => {
  const inv = parseEonInvoices([
    { invoiceNumber: 'F1', issuedValue: 234.5, balanceValue: 234.5, maturityDate: '2026-11-15', emissionDate: '2026-10-15' },
    { invoiceNumber: 'F0', issuedValue: 180, balanceValue: 0, maturityDate: '2026-10-15' },
  ]);
  assert.equal(inv[0].paid, false);
  assert.equal(inv[0].unpaid, 234.5);
  assert.equal(inv[0].issueDate, '2026-10-15');
  assert.equal(inv[1].paid, true);
  const pay = parseEonPayments([{ paymentDate: '2026-10-02T10:00:00', value: 180 }, { value: 3 }]);
  assert.deepEqual(pay, [{ date: '2026-10-02', amount: 180, reference: '' }]);
});

test('E.ON: listă completă vs doar neplătite', async () => {
  const run = async (allResponse: unknown) => {
    const fn = async (url: string) => {
      if (url.includes('status=unpaid')) return new Response(JSON.stringify([{ invoiceNumber: 'U', issuedValue: 50, balanceValue: 50 }]), { status: 200 });
      if (url.includes('/invoices/list')) return new Response(JSON.stringify(allResponse), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    const c = new EonClient({ email: 'a', password: 'b' }, { accessToken: 'T', refreshToken: null, tokenType: 'Bearer', flow: 'mobile', expiresAt: Date.now() + 3600_000 }, async () => {}, fn);
    return c.getInvoices('AC');
  };
  const full = await run([{ invoiceNumber: 'P', issuedValue: 10, balanceValue: 0 }, { invoiceNumber: 'U', issuedValue: 50, balanceValue: 50 }]);
  assert.equal(full.complete, true);
  assert.equal(full.invoices.length, 2);
  const partial = await run([{ invoiceNumber: 'U', issuedValue: 50, balanceValue: 50 }]);
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.invoices.map((i) => i.number), ['U']);
});

test('E.ON plăți paginate până la data de început', async () => {
  const pages: Record<string, unknown> = {
    '1': { list: [{ paymentDate: '2026-10-02T00:00:00', value: 100 }], hasNext: true },
    '2': { list: [{ paymentDate: '2025-01-05T00:00:00', value: 90 }, { paymentDate: '2024-12-05T00:00:00', value: 80 }], hasNext: true },
    '3': { list: [{ paymentDate: '2024-11-05T00:00:00', value: 70 }], hasNext: false },
  };
  let calls = 0;
  const fn = async (url: string) => {
    calls++;
    const page = new URL(url).searchParams.get('page')!;
    return new Response(JSON.stringify(pages[page]), { status: 200 });
  };
  const c = new EonClient({ email: 'a', password: 'b' }, { accessToken: 'T', refreshToken: null, tokenType: 'Bearer', flow: 'mobile', expiresAt: Date.now() + 3600_000 }, async () => {}, fn);
  const p = await c.getPayments('AC', '2025-01-01');
  assert.deepEqual(p.map((x) => x.amount), [100, 90]);
  assert.equal(calls, 3);
});

test('Electrica: cont contract, facturi, citiri → lunar', () => {
  const places = parseElectricaHierarchy({ details: [{ ClientCode: 'C1', to_ContContract: [{ ContractAccount: 'CA1', to_LocConsum: [{ IdLocConsum: 'N1' }] }] }] });
  assert.equal(places[0].contractAccount, 'CA1');

  const inv = parseElectricaInvoices(
    {
      body: {
        response: [
          { ContractAccount: 'CA1', FiscalNumber: 'EF1', IssueDate: '2026-10-05', DueDate: '2026-10-25', TotalAmount: '212.40', UnpaidValue: '212.40', InvoiceStatus: 'Neachitata' },
          { ContractAccount: 'CA1', FiscalNumber: 'EF0', IssueDate: '2026-09-05', TotalAmount: '198', UnpaidValue: '0', InvoiceStatus: 'Achitata' },
          { ContractAccount: 'ALT', FiscalNumber: 'X', TotalAmount: '1' },
        ],
      },
    },
    'CA1',
  );
  assert.deepEqual(inv.map((i) => [i.number, i.paid, i.unpaid]), [['EF1', false, 212.4], ['EF0', true, 0]]);

  const readings = parseElectricaReadings([
    { ReadingDate: '2026-09-22', Index: '15838', RegisterCode: '1.8.0', MeterReadingType: 'Citire client' },
    { ReadingDate: '2026-09-22', Index: '300', RegisterCode: '2.8.0' },
    { ReadingDate: '2026-08-21', Index: '15650', RegisterCode: '1.8.0', MeterReadingType: 'Comp. distributie' },
    { ReadingDate: '2026-10-21', Index: '15950', RegisterCode: '1.8.0' },
  ]);
  assert.deepEqual(readings.map((r) => r.index), [15650, 15838, 15950]);
  const monthly = electricaReadingsToMonthly(readings);
  assert.deepEqual(monthly.map((m) => [m.month, m.consumption, m.index]), [
    ['2026-08', null, 15650],
    ['2026-09', 188, 15838],
    ['2026-10', 112, 15950],
  ]);
});

test('începutul istoricului = 1 ianuarie anul trecut', () => {
  assert.equal(historyStart('2026-10-26'), '2025-01-01');
});
