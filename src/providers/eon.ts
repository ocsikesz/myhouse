/**
 * Client pentru API-ul aplicației E.ON Myline (api2.eon.ro).
 * Endpoint-urile și autentificarea sunt portate din integrarea open-source
 * cnecrea/eonromania (licență MIT).
 */
import { hmacMd5Hex } from '@/lib/md5';

import { AuthRequiredError, httpJson, isRecord, isoDay, num, str, type FetchFn } from './http';

const API = 'https://api2.eon.ro';
const SUBSCRIPTION_KEY = 'e43698af63d84daa9763bbef7918378f';
const SUBSCRIPTION_KEY_WEB = '674e9032df9d456fa371e17a4097a5b8';
const AUTH_VERIFY_SECRET = 'zrAnQjN0bDjlTsKYmbpexjaBNY6wrCzuIqGWNgqoaJzlLrYiqd';

const MFA_REQUIRED_CODE = '6054';
const INVALID_HEADER_CODE = '6075';
const BAD_CREDENTIALS_CODE = '6101';

const HEADERS_MOBILE: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
  'User-Agent': 'EON Myline/Android',
  'x-client-source': 'mylineWeb',
};

const HEADERS_WEB: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY_WEB,
  Origin: 'https://www.eon.ro',
  Referer: 'https://www.eon.ro/myline/login',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'x-client-source': 'mylineWeb',
};

type Flow = 'mobile' | 'web';

export interface EonCredentials {
  email: string;
  password: string;
}

export interface EonTokens {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  flow: Flow;
  /** Epoch ms */
  expiresAt: number;
}

export interface EonMfa {
  uuid: string;
  type: string;
  alternativeType: string;
  recipient: string;
  flow: Flow;
}

export type EonLoginResult =
  | { kind: 'ok'; tokens: EonTokens }
  | { kind: 'mfa'; mfa: EonMfa }
  | { kind: 'bad_credentials' }
  | { kind: 'error'; message: string };

export interface EonContract {
  accountContract: string;
  /** '01' electricitate, '02' gaz */
  utilityType: string;
  address: string;
  /** Contractul colectiv (DUO) din care face parte, dacă e cazul */
  parent: string | null;
}

export interface EonMeterIndex {
  windowStart: string | null;
  windowEnd: string | null;
  inWindow: boolean;
  /** Ultimul index validat (facturat) */
  lastIndex: number | null;
  /** Tipul citirii curente: Citire distribuitor / Autocitire / Estimare */
  readingType: string | null;
  ablbelnr: string | null;
  deviceNumber: string | null;
  /** Index transmis pentru perioada curentă, dacă există */
  submittedIndex: number | null;
  submittedAt: string | null;
}

const READING_TYPES: Record<string, string> = { '01': 'Citire distribuitor', '02': 'Autocitire', '03': 'Estimare' };

function headersFor(flow: Flow): Record<string, string> {
  return flow === 'mobile' ? HEADERS_MOBILE : HEADERS_WEB;
}

function extractAccessToken(d: Record<string, unknown>): string | null {
  const t = d.access_token ?? d.accessToken ?? d.token;
  return typeof t === 'string' && t ? t : null;
}

function tokensFrom(d: Record<string, unknown>, flow: Flow, previousRefresh: string | null = null): EonTokens | null {
  const accessToken = extractAccessToken(d);
  if (!accessToken) return null;
  const expiresIn = num(d.expires_in ?? d.expiresIn) ?? 3600;
  const refresh = d.refresh_token ?? d.refreshToken;
  return {
    accessToken,
    refreshToken: typeof refresh === 'string' && refresh ? refresh : previousRefresh,
    tokenType: str(d.token_type ?? d.tokenType) || 'Bearer',
    flow,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function errorMessage(data: unknown, fallback: string): string {
  if (isRecord(data)) {
    const m = data.description ?? data.message ?? data.title ?? data.error;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return fallback;
}

// ---------- Parsare (funcții pure, testate) ----------

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function buildEonAddress(a: unknown): string {
  if (!isRecord(a)) return '';
  const parts: string[] = [];
  const street = isRecord(a.street) ? a.street : null;
  if (street) {
    const type = isRecord(street.streetType) ? str(street.streetType.label) : '';
    const name = [type, str(street.streetName)].filter(Boolean).join(' ');
    if (name) {
      const titled = titleCase(name);
      const nr = str(a.streetNumber);
      parts.push(nr ? `${titled} ${nr}` : titled);
    }
  }
  const ap = str(a.apartment);
  if (ap && ap !== '0') parts.push(`ap. ${ap}`);
  const locality = isRecord(a.locality) ? a.locality : null;
  if (locality) {
    const city = str(locality.localityName).split('(')[0].trim();
    if (city) parts.push(titleCase(city));
  }
  return parts.join(', ');
}

export function parseEonContracts(list: unknown, parent: string | null = null): { contracts: EonContract[]; collectives: string[] } {
  const contracts: EonContract[] = [];
  const collectives: string[] = [];
  if (!Array.isArray(list)) return { contracts, collectives };
  for (const c of list) {
    if (!isRecord(c)) continue;
    const ac = str(c.accountContract);
    if (!ac) continue;
    const utilityType = str(c.utilityType);
    const isCollective =
      utilityType === '00' || str(c.type) === '98' || c.isCollectiveContract === true || c.collectiveContract === true;
    if (isCollective) {
      collectives.push(ac);
      continue;
    }
    contracts.push({ accountContract: ac, utilityType, address: buildEonAddress(c.consumptionPointAddress), parent });
  }
  return { contracts, collectives };
}

export function parseEonMeterIndex(data: unknown, today: string): EonMeterIndex {
  const d = isRecord(data) ? data : {};
  const period = isRecord(d.readingPeriod) ? d.readingPeriod : {};
  const details = isRecord(d.indexDetails) ? d.indexDetails : {};
  const devices = Array.isArray(details.devices) ? details.devices : [];

  let first: Record<string, unknown> | null = null;
  let deviceNumber: string | null = null;
  for (const dev of devices) {
    if (!isRecord(dev)) continue;
    const idx = Array.isArray(dev.indexes) ? dev.indexes.find(isRecord) : undefined;
    if (idx) {
      first = idx;
      deviceNumber = str(dev.deviceNumber) || null;
      break;
    }
  }

  const windowStart = isoDay(period.startDate);
  const windowEnd = isoDay(period.endDate);
  let inWindow: boolean;
  if (typeof period.inPeriod === 'boolean') inWindow = period.inPeriod;
  else if (typeof period.allowedReading === 'boolean') inWindow = period.allowedReading;
  else inWindow = !!windowStart && today >= windowStart && (!windowEnd || today <= windowEnd);

  const sentAt = first ? str(first.sentAt) || null : null;
  const current = first ? num(first.currentValue) : null;
  // Un index „trimis” contează doar dacă a fost transmis în fereastra curentă
  const sentDay = isoDay(sentAt);
  const submittedThisWindow = !!sentDay && !!windowStart && sentDay >= windowStart;

  return {
    windowStart,
    windowEnd,
    inWindow,
    lastIndex: first ? num(first.oldValue) ?? num(first.minValue) : null,
    readingType: READING_TYPES[str(period.currentReadingType)] ?? null,
    ablbelnr: first ? str(first.ablbelnr) || null : null,
    deviceNumber,
    submittedIndex: submittedThisWindow ? current : null,
    submittedAt: submittedThisWindow ? sentAt : null,
  };
}

// ---------- Client ----------

export class EonClient {
  constructor(
    private readonly creds: EonCredentials,
    private tokens: EonTokens | null,
    private readonly onTokens: (t: EonTokens | null) => Promise<void>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  /** Login complet. Încearcă fluxul mobil, apoi pe cel web dacă E.ON respinge header-ele. */
  async login(): Promise<EonLoginResult> {
    for (const flow of ['mobile', 'web'] as const) {
      const url = flow === 'mobile' ? `${API}/users/v1/userauth/mobile-login` : `${API}/users/v1/userauth/login`;
      const body =
        flow === 'mobile'
          ? { username: this.creds.email, password: this.creds.password, verify: hmacMd5Hex(AUTH_VERIFY_SECRET, this.creds.email) }
          : { username: this.creds.email, password: this.creds.password, rememberMe: true };

      const res = await httpJson(this.fetchFn, url, { method: 'POST', headers: headersFor(flow), body: JSON.stringify(body) });
      if (res.status === 0) return { kind: 'error', message: `Fără conexiune la E.ON (${res.text})` };
      const data = isRecord(res.data) ? res.data : {};

      if (res.status === 200) {
        const tokens = tokensFrom(data, flow);
        if (tokens) {
          await this.setTokens(tokens);
          return { kind: 'ok', tokens };
        }
      }
      const code = str(data.code);
      if (res.status === 400 && code === MFA_REQUIRED_CODE) {
        return {
          kind: 'mfa',
          mfa: {
            uuid: str(data.description),
            type: str(data.secondFactorType) || 'EMAIL',
            alternativeType: str(data.secondFactorAlternativeType),
            recipient: str(data.secondFactorRecipient),
            flow,
          },
        };
      }
      if (res.status === 400 && code === INVALID_HEADER_CODE && flow === 'mobile') continue;
      if (res.status === 400 && code === BAD_CREDENTIALS_CODE) return { kind: 'bad_credentials' };
      if (res.status === 401) return { kind: 'bad_credentials' };
      return { kind: 'error', message: errorMessage(res.data, `Login E.ON eșuat (HTTP ${res.status})`) };
    }
    return { kind: 'error', message: 'Login E.ON eșuat' };
  }

  async completeMfa(mfa: EonMfa, code: string): Promise<EonLoginResult> {
    const url =
      mfa.flow === 'web' ? `${API}/users/v1/second-factor-auth/login` : `${API}/users/v1/second-factor-auth/mobile-login`;
    const body = mfa.flow === 'web' ? { uuid: mfa.uuid, code } : { uuid: mfa.uuid, code, interval: null, type: null };
    const res = await httpJson(this.fetchFn, url, { method: 'POST', headers: headersFor(mfa.flow), body: JSON.stringify(body) });
    if (res.status === 200 && isRecord(res.data)) {
      const tokens = tokensFrom(res.data, mfa.flow);
      if (tokens) {
        await this.setTokens(tokens);
        return { kind: 'ok', tokens };
      }
    }
    if (res.status === 0) return { kind: 'error', message: `Fără conexiune la E.ON (${res.text})` };
    return { kind: 'error', message: errorMessage(res.data, 'Cod 2FA respins sau expirat') };
  }

  async resendMfa(mfa: EonMfa, type?: string): Promise<EonMfa | null> {
    const res = await httpJson(this.fetchFn, `${API}/users/v1/second-factor-auth/resend-code`, {
      method: 'POST',
      headers: headersFor(mfa.flow),
      body: JSON.stringify({ uuid: mfa.uuid, secondFactorValidity: null, type: type ?? mfa.type, action: 'AUTHORIZATION', recipient: null }),
    });
    if (res.status !== 200) return null;
    const d = isRecord(res.data) ? res.data : {};
    return { ...mfa, type: type ?? mfa.type, uuid: str(d.uuid) || mfa.uuid, recipient: str(d.recipient) || mfa.recipient };
  }

  private async setTokens(t: EonTokens | null) {
    this.tokens = t;
    await this.onTokens(t);
  }

  private async refresh(): Promise<boolean> {
    const t = this.tokens;
    if (!t) return false;
    const attempts: [string, object][] = [];
    if (t.flow === 'mobile' && t.refreshToken) {
      attempts.push([`${API}/users/v1/userauth/mobile-refresh-token`, { refreshToken: t.refreshToken }]);
    }
    attempts.push([`${API}/users/v1/userauth/refresh-token`, { token: t.accessToken }]);
    for (const [url, body] of attempts) {
      const res = await httpJson(this.fetchFn, url, { method: 'POST', headers: headersFor(t.flow), body: JSON.stringify(body) });
      if (res.status === 200 && isRecord(res.data)) {
        const next = tokensFrom(res.data, t.flow, t.refreshToken);
        if (next) {
          await this.setTokens(next);
          return true;
        }
      }
    }
    return false;
  }

  /** Asigură un token valid: refresh, apoi login complet. Aruncă AuthRequiredError dacă e nevoie de utilizator. */
  private async ensureToken(force = false): Promise<EonTokens> {
    if (!force && this.tokens && this.tokens.expiresAt - Date.now() > 5 * 60_000) return this.tokens;
    if (this.tokens && (await this.refresh())) return this.tokens!;
    const r = await this.login();
    if (r.kind === 'ok') return r.tokens;
    if (r.kind === 'mfa') throw new AuthRequiredError('E.ON cere cod de verificare (2FA). Reconectează contul din Setări.', 'mfa');
    if (r.kind === 'bad_credentials') throw new AuthRequiredError('E.ON: email sau parolă greșită.', 'bad_credentials');
    throw new Error(r.message);
  }

  private async request(method: 'GET' | 'POST', url: string, body?: unknown) {
    let t = await this.ensureToken();
    const send = (tok: EonTokens) =>
      httpJson(this.fetchFn, url, {
        method,
        headers: { ...headersFor(tok.flow), Authorization: `${tok.tokenType} ${tok.accessToken}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let res = await send(t);
    if (res.status === 401) {
      t = await this.ensureToken(true);
      res = await send(t);
    }
    if (res.status === 0) throw new Error(`Fără conexiune la E.ON (${res.text})`);
    return res;
  }

  /** Toate contractele individuale (gaz / electricitate), inclusiv subcontractele DUO. */
  async getContracts(): Promise<EonContract[]> {
    const res = await this.request('GET', `${API}/partners/v2/account-contracts/list`);
    if (res.status !== 200) throw new Error(errorMessage(res.data, `E.ON: lista contractelor a eșuat (HTTP ${res.status})`));
    const { contracts, collectives } = parseEonContracts(res.data);
    for (const coll of collectives) {
      const sub = await this.request('GET', `${API}/partners/v2/account-contracts/list?collectiveContract=${encodeURIComponent(coll)}`);
      if (sub.status === 200) contracts.push(...parseEonContracts(sub.data, coll).contracts);
    }
    return contracts;
  }

  async getMeterIndex(accountContract: string, today: string): Promise<EonMeterIndex> {
    const res = await this.request('GET', `${API}/meterreadings/v1/meter-reading/${encodeURIComponent(accountContract)}/index`);
    if (res.status !== 200) {
      // În afara perioadei de citire API-ul poate răspunde cu eroare — tratăm ca „fără date”
      return parseEonMeterIndex(null, today);
    }
    return parseEonMeterIndex(res.data, today);
  }

  async submitIndex(accountContract: string, ablbelnr: string, value: number): Promise<{ ok: true } | { ok: false; message: string }> {
    const res = await this.request('POST', `${API}/meterreadings/v1/meter-reading/index`, {
      accountContract,
      channel: 'MOBILE',
      indexes: [{ ablbelnr, indexValue: Math.trunc(value) }],
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    return { ok: false, message: errorMessage(res.data, `E.ON a respins indexul (HTTP ${res.status})`) };
  }
}
