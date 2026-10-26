import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ElectricaClient,
  parseElectricaHierarchy,
  parseElectricaMeterList,
  setIndexError,
} from '../src/providers/electrica';

test('ierarhie → locuri de consum cu adresă', () => {
  const places = parseElectricaHierarchy({
    details: [
      {
        ClientCode: '1000123',
        to_ContContract: [
          {
            to_LocConsum: [
              { IdLocConsum: '7003050900', ServiceType: 'Electricitate', Street: 'GHEORGHE DOJA', HouseNumber: '12', Building: 'A', RoomNumber: '5', City: 'TARGU MURES' },
              { IdLocConsum: '7003050900' },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(places.length, 1);
  assert.equal(places[0].address, 'Gheorghe Doja 12, bl. A, ap. 5, Targu Mures');
  assert.equal(places[0].clientCode, '1000123');
});

const meterList = {
  status: 'OK',
  body: {
    response: {
      PACIndicator: '1',
      StartDatePAC: '2026-10-20',
      EndDatePAC: '2026-10-24',
      to_Contor: [
        {
          SerieContor: 'ABC123',
          to_Cadran: [
            { RegisterCode: '2.8.0', Index: '300' },
            { RegisterCode: '1.8.0', Index: '15838', ReadingDate: '2026-09-22', MeterReadingType: 'Autocitire', IndexPAC: '15950', ReadingDatePAC: '2026-10-21' },
          ],
        },
      ],
    },
  },
};

test('meter-list: registrul de consum, fereastra, index trimis', () => {
  const m = parseElectricaMeterList(meterList, '2026-10-22');
  assert.equal(m.registerCode, '1.8.0');
  assert.equal(m.serieContor, 'ABC123');
  assert.equal(m.lastIndex, 15838);
  assert.equal(m.inWindow, true);
  assert.equal(m.submittedIndex, 15950);
  assert.equal(parseElectricaMeterList(meterList, '2026-10-25').inWindow, false);
});

test('fără autocitire activă', () => {
  const off = structuredClone(meterList);
  off.body.response.PACIndicator = '0';
  const m = parseElectricaMeterList(off, '2026-10-22');
  assert.equal(m.inWindow, false);
  assert.equal(m.windowStart, null);
});

test('erori set-index', () => {
  assert.equal(setIndexError({ body: { response: { errorDetails: 'Exista citire la aceeasi data' } } }), 'Exista citire la aceeasi data');
  assert.equal(setIndexError({ errors: [{ errorMessage: 'X' }] }), 'X');
  assert.equal(setIndexError({ status: 'OK', body: { response: {} } }), null);
});

test('login + reîncercare la 401 + payload set-index', async () => {
  let posts = 0;
  const fn = async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.endsWith('/login')) {
      assert.deepEqual(body, { email: 'a@b.ro', parola: 'p' });
      return new Response(JSON.stringify({ error: false, app_token: 'T2' }), { status: 200 });
    }
    if (url.endsWith('/set-index')) {
      posts++;
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer T1') return new Response('{}', { status: 401 });
      assert.deepEqual(body, { NLC: 'N1', to_Contor: [{ SerieContor: 'S1', to_Cadran: [{ RegisterCode: '1.8.0', Index: '15950' }] }] });
      return new Response(JSON.stringify({ status: 'OK', body: { response: {} } }), { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };
  const c = new ElectricaClient({ email: 'a@b.ro', password: 'p' }, { token: 'T1' }, async () => {}, fn);
  assert.deepEqual(await c.submitIndex('N1', 'S1', '1.8.0', 15950), { ok: true });
  assert.equal(posts, 2);
});
