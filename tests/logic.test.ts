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
    { label: 'Bucătărie', value: 123.4, unit: 'm³' },
    { label: 'Baie', value: 98.765, unit: 'm³' },
  ]);
  assert.equal(msg, 'Bună ziua! Indexuri apă rece – Str. X 10, ap. 5, 26.10.2026:\nBucătărie: 123,400 m³\nBaie: 98,765 m³');
});
