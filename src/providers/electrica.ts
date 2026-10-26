/**
 * Client pentru API-ul MyElectrica (api.myelectrica.ro).
 * Endpoint-urile sunt portate din integrarea open-source cnecrea/myelectrica (licență MIT).
 */
import { AuthRequiredError, httpJson, isRecord, isoDay, num, str, type FetchFn } from './http';

const API = 'https://api.myelectrica.ro/api';

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

/** Registrul de energie activă consumată */
const REGISTER_CONSUMPTION = '1.8.0';

export interface ElectricaCredentials {
  email: string;
  password: string;
}

export interface ElectricaTokens {
  token: string;
}

export interface ElectricaPlace {
  nlc: string;
  clientCode: string;
  serviceType: string;
  address: string;
}

export interface ElectricaMeter {
  windowStart: string | null;
  windowEnd: string | null;
  inWindow: boolean;
  lastIndex: number | null;
  lastIndexDate: string | null;
  lastIndexType: string | null;
  serieContor: string | null;
  registerCode: string | null;
  submittedIndex: number | null;
  submittedAt: string | null;
}

// ---------- Parsare (funcții pure, testate) ----------

/** Unele endpoint-uri întorc direct datele, altele {status, body: {response}}. */
export function bodyResponse(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw) && isRecord(raw.body)) return raw.body.response ?? null;
  return raw ?? null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function activeFlag(v: unknown): boolean {
  return ['1', 'true', 'x', 'da'].includes(str(v).toLowerCase());
}

export function parseElectricaHierarchy(raw: unknown): ElectricaPlace[] {
  const details = isRecord(raw) && Array.isArray(raw.details) ? raw.details : [];
  const places: ElectricaPlace[] = [];
  const seen = new Set<string>();
  for (const client of details) {
    if (!isRecord(client)) continue;
    const clientCode = str(client.ClientCode);
    const contracts = Array.isArray(client.to_ContContract) ? client.to_ContContract : [];
    for (const contract of contracts) {
      if (!isRecord(contract)) continue;
      const locs = Array.isArray(contract.to_LocConsum) ? contract.to_LocConsum : [];
      for (const loc of locs) {
        if (!isRecord(loc)) continue;
        const nlc = str(loc.IdLocConsum);
        if (!nlc || seen.has(nlc)) continue;
        seen.add(nlc);
        const parts: string[] = [];
        const street = titleCase(str(loc.Street));
        const nr = str(loc.HouseNumber);
        if (street) parts.push(nr ? `${street} ${nr}` : street);
        if (str(loc.Building)) parts.push(`bl. ${str(loc.Building)}`);
        if (str(loc.Entrance)) parts.push(`sc. ${str(loc.Entrance)}`);
        if (str(loc.Floor)) parts.push(`et. ${str(loc.Floor)}`);
        if (str(loc.RoomNumber)) parts.push(`ap. ${str(loc.RoomNumber)}`);
        const city = titleCase(str(loc.City));
        if (city) parts.push(city);
        places.push({ nlc, clientCode, serviceType: str(loc.ServiceType), address: parts.join(', ') });
      }
    }
  }
  return places;
}

export function parseElectricaMeterList(raw: unknown, today: string): ElectricaMeter {
  const r = bodyResponse(raw);
  const d = isRecord(r) ? r : {};

  // Registrul de consum 1.8.0; altfel primul registru care nu e de producție (2.8.x)
  let contor: Record<string, unknown> | null = null;
  let cadran: Record<string, unknown> | null = null;
  const contors = Array.isArray(d.to_Contor) ? d.to_Contor : [];
  outer: for (const c of contors) {
    if (!isRecord(c)) continue;
    for (const k of Array.isArray(c.to_Cadran) ? c.to_Cadran : []) {
      if (!isRecord(k)) continue;
      const code = str(k.RegisterCode);
      if (code === REGISTER_CONSUMPTION) {
        contor = c;
        cadran = k;
        break outer;
      }
      if (!cadran && !code.startsWith('2.8')) {
        contor = c;
        cadran = k;
      }
    }
  }

  const pacActive = activeFlag(d.PACIndicator);
  const windowStart = isoDay(d.StartDatePAC);
  const windowEnd = isoDay(d.EndDatePAC);
  const inWindow = pacActive && !!windowStart && today >= windowStart && (!windowEnd || today <= windowEnd);

  const pacIndex = cadran ? num(cadran.IndexPAC) : null;
  const pacDate = cadran ? isoDay(cadran.ReadingDatePAC) : null;
  const submittedThisWindow = pacIndex !== null && !!pacDate && !!windowStart && pacDate >= windowStart;

  return {
    windowStart: pacActive ? windowStart : null,
    windowEnd: pacActive ? windowEnd : null,
    inWindow,
    lastIndex: cadran ? num(cadran.Index) : null,
    lastIndexDate: cadran ? isoDay(cadran.ReadingDate) : null,
    lastIndexType: cadran ? str(cadran.MeterReadingType) || null : null,
    serieContor: contor ? str(contor.SerieContor) || null : null,
    registerCode: cadran ? str(cadran.RegisterCode) || null : null,
    submittedIndex: submittedThisWindow ? pacIndex : null,
    submittedAt: submittedThisWindow ? pacDate : null,
  };
}

/** Mesajul de eroare din răspunsul set-index, sau null dacă indexul a fost acceptat. */
export function setIndexError(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const resp = isRecord(raw.body) && isRecord(raw.body.response) ? raw.body.response : null;
  if (resp && resp.errorDetails) return str(resp.errorDetails);
  if (Array.isArray(raw.errors) && raw.errors.length) {
    return raw.errors.map((e) => (isRecord(e) ? str(e.errorMessage) || JSON.stringify(e) : str(e))).join('; ');
  }
  if (raw.error === true) return str(raw.message) || 'Eroare necunoscută';
  return null;
}

// ---------- Client ----------

export class ElectricaClient {
  constructor(
    private readonly creds: ElectricaCredentials,
    private tokens: ElectricaTokens | null,
    private readonly onTokens: (t: ElectricaTokens | null) => Promise<void>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async login(): Promise<{ ok: true } | { ok: false; message: string; badCredentials: boolean }> {
    const res = await httpJson(this.fetchFn, `${API}/login`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ email: this.creds.email, parola: this.creds.password }),
    });
    if (res.status === 0) return { ok: false, message: `Fără conexiune la Electrica (${res.text})`, badCredentials: false };
    const d = isRecord(res.data) ? res.data : {};
    if (res.status === 200 && d.error === false && typeof d.app_token === 'string' && d.app_token) {
      this.tokens = { token: d.app_token };
      await this.onTokens(this.tokens);
      return { ok: true };
    }
    const message = str(d.message) || (Array.isArray(d.errors) ? setIndexError(d) ?? '' : '') || `Login Electrica eșuat (HTTP ${res.status})`;
    return { ok: false, message, badCredentials: res.status === 200 || res.status === 400 || res.status === 401 };
  }

  private async ensureToken(force = false): Promise<string> {
    if (!force && this.tokens?.token) return this.tokens.token;
    const r = await this.login();
    if (r.ok) return this.tokens!.token;
    if (r.badCredentials) throw new AuthRequiredError(`Electrica: ${r.message}`, 'bad_credentials');
    throw new Error(r.message);
  }

  private async request(method: 'GET' | 'POST', url: string, body?: unknown) {
    const send = (token: string) =>
      httpJson(this.fetchFn, url, {
        method,
        headers: { ...HEADERS, Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let res = await send(await this.ensureToken());
    if (res.status === 401) res = await send(await this.ensureToken(true));
    if (res.status === 0) throw new Error(`Fără conexiune la Electrica (${res.text})`);
    return res;
  }

  async getPlaces(): Promise<ElectricaPlace[]> {
    const res = await this.request('GET', `${API}/account-data-hierarchy`);
    if (res.status < 200 || res.status >= 300) throw new Error(`Electrica: ierarhia contului a eșuat (HTTP ${res.status})`);
    return parseElectricaHierarchy(res.data);
  }

  async getMeter(nlc: string, today: string): Promise<ElectricaMeter> {
    const res = await this.request('GET', `${API}/meter-list/${encodeURIComponent(nlc)}`);
    if (res.status < 200 || res.status >= 300) return parseElectricaMeterList(null, today);
    return parseElectricaMeterList(res.data, today);
  }

  async submitIndex(
    nlc: string,
    serieContor: string,
    registerCode: string,
    value: number,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const res = await this.request('POST', `${API}/set-index`, {
      NLC: nlc,
      to_Contor: [{ SerieContor: serieContor, to_Cadran: [{ RegisterCode: registerCode, Index: String(Math.trunc(value)) }] }],
    });
    const err = setIndexError(res.data);
    if (res.status >= 200 && res.status < 300 && !err) return { ok: true };
    return { ok: false, message: err ?? `Electrica a respins indexul (HTTP ${res.status})` };
  }
}
