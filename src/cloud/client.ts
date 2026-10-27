import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Clientul Supabase, direct prin REST (Auth, PostgREST, Storage) — fără SDK,
 * ca să nu aducem polyfill-uri în aplicație. `fetchFn` se poate înlocui în teste.
 */

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export function cloudConfig(): CloudConfig | null {
  const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseAnonKey?: string };
  const url = (extra.supabaseUrl ?? '').replace(/\/+$/, '');
  const anonKey = extra.supabaseAnonKey ?? '';
  return url && anonKey ? { url, anonKey } : null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** ms epoch */
  expiresAt: number;
  userId: string;
  email: string;
}

const SESSION_KEY = 'cloud.session';
const FAMILY_KEY = 'cloud.family_key';

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

function sessionFrom(data: Record<string, unknown>): Session {
  const user = (data.user ?? {}) as { id?: string; email?: string };
  return {
    accessToken: String(data.access_token ?? ''),
    refreshToken: String(data.refresh_token ?? ''),
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    userId: String(user.id ?? ''),
    email: String(user.email ?? ''),
  };
}

async function authToken(cfg: CloudConfig, grant: 'password' | 'refresh_token', body: object): Promise<Session> {
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CloudError('Fără conexiune la internet.');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = String(data.error_description ?? data.msg ?? data.message ?? '');
    if (/invalid login|invalid_grant|credentials/i.test(msg) && grant === 'password') {
      throw new CloudError('Email sau parolă greșită pentru contul familiei.', res.status);
    }
    if (/not confirmed/i.test(msg)) throw new CloudError('Emailul contului nu e confirmat. Confirmă-l din Supabase → Authentication.', res.status);
    throw new CloudError(msg || `Eroare la login (${res.status})`, res.status);
  }
  return sessionFrom(data);
}

export async function signIn(email: string, password: string): Promise<Session> {
  const cfg = cloudConfig();
  if (!cfg) throw new CloudError('Sincronizarea nu e configurată în această versiune a aplicației.');
  const s = await authToken(cfg, 'password', { email, password });
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(s));
  return s;
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(FAMILY_KEY);
}

export async function storedSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/** Sesiunea validă (o reîmprospătează dacă expiră în curând); null dacă nu ești conectat. */
export async function activeSession(): Promise<Session | null> {
  const cfg = cloudConfig();
  const s = await storedSession();
  if (!cfg || !s) return null;
  if (s.expiresAt - Date.now() > 60_000) return s;
  try {
    const fresh = await authToken(cfg, 'refresh_token', { refresh_token: s.refreshToken });
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(fresh));
    return fresh;
  } catch (e) {
    // Token respins definitiv → trebuie reconectat; altfel (fără net) încercăm data viitoare
    if (e instanceof CloudError && e.status >= 400 && e.status < 500) await SecureStore.deleteItemAsync(SESSION_KEY);
    throw e;
  }
}

export async function saveFamilyKey(keyHex: string): Promise<void> {
  await SecureStore.setItemAsync(FAMILY_KEY, keyHex);
}

export async function familyKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(FAMILY_KEY);
  } catch {
    return null;
  }
}

// ---------- PostgREST ----------

export interface CloudRecord {
  kind: string;
  uid: string;
  data: unknown;
  deleted: boolean;
  server_ts?: string;
}

function headers(cfg: CloudConfig, s: Session, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: cfg.anonKey, Authorization: `Bearer ${s.accessToken}`, ...extra };
}

async function checked(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const text = await res.text().catch(() => '');
  throw new CloudError(`${what}: ${res.status} ${text.slice(0, 200)}`, res.status);
}

export async function upsertRecords(s: Session, rows: CloudRecord[]): Promise<void> {
  const cfg = cloudConfig()!;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => ({ user_id: s.userId, kind: r.kind, uid: r.uid, data: r.data, deleted: r.deleted }));
    const res = await fetch(`${cfg.url}/rest/v1/records?on_conflict=user_id,kind,uid`, {
      method: 'POST',
      headers: headers(cfg, s, {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(chunk),
    });
    await checked(res, 'Trimiterea în cloud a eșuat');
  }
}

/** Ce s-a schimbat în cloud după `since` (ora serverului), în ordine. */
export async function fetchRecordsSince(s: Session, since: string | null, limit = 500): Promise<CloudRecord[]> {
  const cfg = cloudConfig()!;
  const filter = since ? `&server_ts=gt.${encodeURIComponent(since)}` : '';
  const res = await fetch(
    `${cfg.url}/rest/v1/records?select=kind,uid,data,deleted,server_ts${filter}&order=server_ts.asc&limit=${limit}`,
    { headers: headers(cfg, s) },
  );
  await checked(res, 'Citirea din cloud a eșuat');
  return (await res.json()) as CloudRecord[];
}

/** O singură înregistrare (ex. instantaneul furnizorilor); null dacă nu există. */
export async function fetchRecord(s: Session, kind: string, uid: string): Promise<CloudRecord | null> {
  const cfg = cloudConfig()!;
  const res = await fetch(
    `${cfg.url}/rest/v1/records?select=kind,uid,data,deleted,server_ts&kind=eq.${encodeURIComponent(kind)}&uid=eq.${encodeURIComponent(uid)}`,
    { headers: headers(cfg, s) },
  );
  await checked(res, 'Citirea din cloud a eșuat');
  const rows = (await res.json()) as CloudRecord[];
  return rows[0] ?? null;
}

export function storageUrl(path: string, authenticated = false): string {
  const cfg = cloudConfig()!;
  return `${cfg.url}/storage/v1/object/${authenticated ? 'authenticated/' : ''}photos/${path}`;
}

export function storageHeaders(s: Session): Record<string, string> {
  return headers(cloudConfig()!, s);
}
