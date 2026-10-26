import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractRuns, findMeterCandidates, interpretations, normalizeDigits, type OcrInput } from '../src/lib/meterOcr';

/** Ajutor: un rând OCR din elemente [text, left, top, width, height] */
function line(...els: [string, number, number, number, number][]) {
  const elements = els.map(([text, l, t, w, h]) => ({ text, frame: { left: l, top: t, right: l + w, bottom: t + h } }));
  const f = elements.reduce(
    (a, e) => ({
      left: Math.min(a.left, e.frame.left),
      top: Math.min(a.top, e.frame.top),
      right: Math.max(a.right, e.frame.right),
      bottom: Math.max(a.bottom, e.frame.bottom),
    }),
    { left: 1e9, top: 1e9, right: 0, bottom: 0 },
  );
  return { text: elements.map((e) => e.text).join(' '), frame: f, elements };
}

test('normalizare cifre și litere-sosie', () => {
  assert.equal(normalizeDigits('O6O3O'), '06030');
  assert.equal(normalizeDigits('12,345'), '12.345');
  assert.equal(normalizeDigits('Elster'), null);
  assert.equal(normalizeDigits('m3'), null);
});

test('interpretări cu zecimale citite ca cifre', () => {
  assert.deepEqual(
    interpretations('00123456', 3).filter((x) => !x.trimmed).map((x) => x.value),
    [123456, 12345.6, 1234.56, 123.456],
  );
  assert.deepEqual(interpretations('123.45', 3).map((x) => x.value), [123.45]);
});

test('tamburi citiți ca cifre separate se lipesc', () => {
  const input: OcrInput = { lines: [line(['0', 100, 200, 40, 60], ['6', 145, 200, 40, 60], ['0', 190, 200, 40, 60], ['3', 235, 200, 40, 60], ['8', 280, 200, 40, 60])] };
  assert.deepEqual(extractRuns(input).map((r) => r.raw), ['06038']);
});

test('contor gaz: indexul mare câștigă în fața seriei și a anului', () => {
  const input: OcrInput = {
    lines: [
      line(['Elster', 50, 20, 120, 20], ['BK-G4', 180, 20, 90, 20]),
      line(['Nr.', 50, 60, 30, 18], ['36721458', 90, 60, 160, 18]),
      line(['06105', 100, 200, 230, 64], ['742', 340, 200, 100, 64]),
      line(['Qmax', 50, 320, 60, 16], ['6', 115, 320, 12, 16], ['m3/h', 130, 320, 50, 16]),
      line(['2019', 300, 320, 60, 16]),
    ],
  };
  const c = findMeterCandidates(input, { previous: 6030, typicalDelta: 60, maxDecimals: 3 });
  assert.equal(c[0].value, 6105.742);
});

test('contor apă: zecimalele roșii lipite de partea întreagă', () => {
  const input: OcrInput = {
    lines: [line(['00123', 80, 150, 200, 50], ['456', 285, 150, 110, 50]), line(['Q3', 60, 260, 20, 14], ['2,5', 85, 260, 30, 14])],
  };
  const c = findMeterCandidates(input, { previous: 120.8, typicalDelta: 2.5, maxDecimals: 3 });
  assert.equal(c[0].value, 123.456);
});

test('contor apă ABB: ultimul tambur între 0 și 1 → o cifră în plus; seria de dedesubt nu câștigă', () => {
  const input: OcrInput = {
    lines: [
      line(['D', 120, 60, 20, 30], ['92', 150, 60, 40, 30], ['Qn', 300, 100, 40, 30], ['1,5', 345, 100, 50, 30], ['m3/h', 400, 100, 70, 30]),
      line(['2263', 130, 230, 300, 90], ['1201', 440, 230, 160, 90]),
      line(['RO', 170, 480, 60, 50], ['033/93', 240, 480, 160, 50]),
      line(['x', 400, 650, 15, 25], ['0,0001', 420, 650, 120, 25]),
      line(['04203881', 220, 760, 330, 75]),
      line(['2000', 280, 850, 120, 60]),
    ],
  };
  const c = findMeterCandidates(input, { previous: 2259.4, typicalDelta: 3.5, maxDecimals: 3 });
  assert.equal(c[0].value, 2263.12);
});

test('contor curent: fără istoric, alege numărul mare de 5-6 cifre', () => {
  const input: OcrInput = {
    lines: [
      line(['230V', 40, 30, 60, 18], ['10(60)A', 110, 30, 90, 18], ['50Hz', 210, 30, 60, 18]),
      line(['015838', 90, 140, 260, 70]),
      line(['1000', 60, 260, 50, 16], ['imp/kWh', 115, 260, 90, 16]),
    ],
  };
  const c = findMeterCandidates(input, { previous: null, typicalDelta: null, maxDecimals: 1 });
  assert.equal(c[0].value, 15838);
});

test('fără cifre → fără candidați', () => {
  assert.deepEqual(findMeterCandidates({ lines: [line(['Elster', 0, 0, 10, 10])] }, { previous: null, typicalDelta: null, maxDecimals: 0 }), []);
});
