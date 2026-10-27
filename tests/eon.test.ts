import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { buildEonAddress, EonClient, parseEonContracts, parseEonMeterIndex } from '../src/providers/eon';

test('adresă E.ON', () => {
  const a = {
    street: { streetType: { label: 'STR.' }, streetName: 'GHEORGHE DOJA' },
    streetNumber: '12',
    apartment: '5',
    locality: { localityName: 'TÂRGU MUREŞ (MS)', countyCode: 'MS' },
  };
  assert.equal(buildEonAddress(a), 'Str. Gheorghe Doja 12, ap. 5, Târgu Mureş');
});

test('contracte individuale și DUO', () => {
  const { contracts, collectives } = parseEonContracts([
    { accountContract: '002100234567', utilityType: '02' },
    { accountContract: '009900123456', utilityType: '00' },
    { accountContract: '', utilityType: '01' },
  ]);
  assert.deepEqual(contracts.map((c) => c.accountContract), ['002100234567']);
  assert.deepEqual(collectives, ['009900123456']);
});

const indexSample = {
  readingPeriod: { startDate: '2026-10-22', endDate: '2026-10-28 23:59:59', inPeriod: true, currentReadingType: '02' },
  indexDetails: {
    devices: [
      {
        deviceNumber: '01234567/2020',
        indexes: [{ ablbelnr: '000123', oldValue: '6030', minValue: '6030', currentValue: '6105', sentAt: '2026-10-23T10:00:00' }],
      },
    ],
  },
};

test('index în fereastră, deja trimis', () => {
  const r = parseEonMeterIndex(indexSample, '2026-10-26');
  assert.equal(r.inWindow, true);
  assert.equal(r.windowEnd, '2026-10-28');
  assert.equal(r.lastIndex, 6030);
  assert.equal(r.ablbelnr, '000123');
  assert.equal(r.submittedIndex, 6105);
  assert.equal(r.readingType, 'Autocitire');
});

test('trimitere veche nu contează pentru fereastra nouă', () => {
  const old = structuredClone(indexSample);
  old.indexDetails.devices[0].indexes[0].sentAt = '2026-09-23T10:00:00';
  const r = parseEonMeterIndex(old, '2026-10-26');
  assert.equal(r.submittedIndex, null);
});

test('fără inPeriod: calcul din date', () => {
  const p = structuredClone(indexSample) as Record<string, any>;
  delete p.readingPeriod.inPeriod;
  assert.equal(parseEonMeterIndex(p, '2026-10-26').inWindow, true);
  assert.equal(parseEonMeterIndex(p, '2026-10-29').inWindow, false);
  assert.equal(parseEonMeterIndex(null, '2026-10-26').inWindow, false);
});

function mockFetch(routes: ((url: string, body: any, headers: Record<string, string>) => [number, unknown] | null)[]) {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, body, headers });
    for (const r of routes) {
      const res = r(url, body, headers);
      if (res) return new Response(JSON.stringify(res[1]), { status: res[0] });
    }
    return new Response('{}', { status: 404 });
  };
  return { fn, calls };
}

test('login mobil: semnătură HMAC-MD5 corectă', async () => {
  const { fn, calls } = mockFetch([
    (u) => (u.endsWith('/mobile-login') ? [200, { access_token: 'A', refresh_token: 'R', expires_in: 3600 }] : null),
  ]);
  let saved: unknown = null;
  const c = new EonClient({ email: 'ion@example.ro', password: 'p' }, null, async (t) => void (saved = t), fn);
  const r = await c.login();
  assert.equal(r.kind, 'ok');
  const expected = createHmac('md5', 'zrAnQjN0bDjlTsKYmbpexjaBNY6wrCzuIqGWNgqoaJzlLrYiqd').update('ion@example.ro').digest('hex');
  assert.equal(calls[0].body.verify, expected);
  assert.equal(calls[0].headers['x-client-source'], 'mylineWeb');
  assert.equal((saved as any).refreshToken, 'R');
});

test('login: 2FA și fallback pe fluxul web la 6075', async () => {
  const { fn, calls } = mockFetch([
    (u) => (u.endsWith('/mobile-login') && !u.includes('second-factor') ? [400, { code: '6075' }] : null),
    (u) => (u.endsWith('/userauth/login') ? [400, { code: '6054', description: 'uuid-1', secondFactorType: 'SMS', secondFactorRecipient: '07xx' }] : null),
    (u, b) => (u.endsWith('/second-factor-auth/login') && b.code === '111222' ? [200, { accessToken: 'W', expiresIn: 600 }] : null),
  ]);
  const c = new EonClient({ email: 'a@b.ro', password: 'p' }, null, async () => {}, fn);
  const r = await c.login();
  assert.equal(r.kind, 'mfa');
  if (r.kind !== 'mfa') return;
  assert.equal(r.mfa.flow, 'web');
  assert.equal(r.mfa.uuid, 'uuid-1');
  const done = await c.completeMfa(r.mfa, '111222');
  assert.equal(done.kind, 'ok');
  assert.ok(calls.some((x) => x.url.endsWith('/second-factor-auth/login')));
});

test('parolă greșită', async () => {
  const { fn } = mockFetch([(u) => (u.endsWith('/mobile-login') ? [400, { code: '6101' }] : null)]);
  const c = new EonClient({ email: 'a@b.ro', password: 'x' }, null, async () => {}, fn);
  assert.equal((await c.login()).kind, 'bad_credentials');
});

test('trimitere index cu token și reîncercare la 401', async () => {
  let first = true;
  const { fn, calls } = mockFetch([
    (u) => (u.endsWith('/mobile-login') ? [200, { access_token: 'NEW', expires_in: 3600 }] : null),
    (u) => (u.endsWith('refresh-token') ? [400, {}] : null),
    (u, b, h) => {
      if (!u.endsWith('/meter-reading/index')) return null;
      if (first) {
        first = false;
        return [401, {}];
      }
      assert.equal(h.Authorization, 'Bearer NEW');
      assert.deepEqual(b, { accountContract: 'AC1', channel: 'MOBILE', indexes: [{ ablbelnr: 'X1', indexValue: 6105 }] });
      return [200, {}];
    },
  ]);
  const tokens = { accessToken: 'OLD', refreshToken: null, tokenType: 'Bearer', flow: 'mobile' as const, expiresAt: Date.now() + 3600_000 };
  const c = new EonClient({ email: 'a@b.ro', password: 'p' }, tokens, async () => {}, fn);
  const r = await c.submitIndex('AC1', 'X1', 6105.7);
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.filter((x) => x.url.endsWith('/meter-reading/index')).length, 2);
});

import { parseEonInvoices } from '../src/providers/eon';
import { isoDay } from '../src/providers/http';

test('date: format ISO și românesc', () => {
  assert.equal(isoDay('2026-10-27'), '2026-10-27');
  assert.equal(isoDay('2026-10-27T10:00:00'), '2026-10-27');
  assert.equal(isoDay('27.10.2026'), '2026-10-27');
  assert.equal(isoDay('5.1.2026'), '2026-01-05');
  assert.equal(isoDay('27/10/2026'), '2026-10-27');
  assert.equal(isoDay('31.13.2026'), null);
  assert.equal(isoDay(''), null);
  assert.equal(isoDay(null), null);
});

test('facturi E.ON: datele ZZ.LL.AAAA și factura negativă (credit)', () => {
  const rows = parseEonInvoices({
    list: [
      { invoiceNumber: '012506805283', issuedValue: -170.81, balanceValue: 0, emissionDate: '06.10.2026', maturityDate: '21.10.2026' },
      { invoiceNumber: '002501621289', issuedValue: 981.62, balanceValue: 0, emissionDate: '05.09.2026', maturityDate: '25.09.2026' },
    ],
  });
  assert.deepEqual(rows[0], { number: '012506805283', issueDate: '2026-10-06', dueDate: '2026-10-21', amount: -170.81, unpaid: 0, paid: true });
  assert.equal(rows[1].issueDate, '2026-09-05');
});
