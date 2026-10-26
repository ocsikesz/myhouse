import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkNewReading, withConsumption } from '../src/lib/consumption';
import { formatNumber, parseDecimal } from '../src/lib/format';
import { buildWaterMessage, normalizeRoPhone } from '../src/lib/whatsapp';

const r = (id: number, value: number, read_at: string) => ({
  id, meter_id: 'a', value, read_at, source: 'manual' as const, photo_uri: null, sent_at: null, note: null,
});

test('consum între citiri', () => {
  const h = [r(3, 130, '2026-10-01'), r(2, 125, '2026-09-01'), r(1, 121, '2026-08-01')];
  assert.deepEqual(withConsumption(h).map((p) => p.delta), [5, 4, null]);
  assert.equal(checkNewReading(129, h).ok, false);
  assert.equal(checkNewReading(134, h).ok, true);
  const big = checkNewReading(160, h);
  assert.equal(big.ok === false && big.reason, 'salt_mare');
});

test('parsare și formatare numere', () => {
  assert.equal(parseDecimal('123,45'), 123.45);
  assert.equal(parseDecimal(' 7 '), 7);
  assert.equal(parseDecimal('12a'), null);
  assert.equal(formatNumber(1234.5, 3), '1.234,500');
});

test('telefon și mesaj WhatsApp', () => {
  assert.equal(normalizeRoPhone('0744 123 456'), '40744123456');
  assert.equal(normalizeRoPhone('+40 744-123-456'), '40744123456');
  assert.equal(normalizeRoPhone('0040744123456'), '40744123456');
  assert.equal(normalizeRoPhone('12'), null);
  const msg = buildWaterMessage('Str. X 10, ap. 5', '2026-10-26', [
    { label: 'Bucătărie', value: 123.4, previous: 119.987, unit: 'm³' },
    { label: 'Baie', value: 1098.765, previous: 1095.2, unit: 'm³' },
  ]);
  assert.equal(
    msg,
    'Bună ziua! Indexuri apă rece – Str. X 10, ap. 5, 26.10.2026:\nBucătărie: 123 m³\nBaie: 1098 m³\n\n' +
      'Total luna aceasta: 1221 m³\nTotal luna trecută: 1214 m³\nConsum: 7 m³',
  );
  // Prima citire: fără luna trecută și fără consum
  const first = buildWaterMessage('', '2026-10-26', [
    { label: 'Bucătărie', value: 12.9, previous: null, unit: 'm³' },
    { label: 'Baie', value: 8.1, previous: 7, unit: 'm³' },
  ]);
  assert.equal(first, 'Bună ziua! Indexuri apă rece, 26.10.2026:\nBucătărie: 12 m³\nBaie: 8 m³\n\nTotal luna aceasta: 20 m³');
});

import { addMonths, daysBetween, parseRoDate } from '../src/lib/format';

test('date și luni', () => {
  assert.equal(parseRoDate('25.11.2026'), '2026-11-25');
  assert.equal(parseRoDate('5/1/2027'), '2027-01-05');
  assert.equal(parseRoDate('31.02.2026'), null);
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-10', 3), '2027-01');
  assert.equal(addMonths('2026-10', -12), '2025-10');
  assert.equal(daysBetween('2026-10-26', '2026-11-02'), 7);
});
