export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpResult {
  status: number;
  /** Corpul ca JSON, sau null dacă lipsește / nu e JSON */
  data: unknown;
  text: string;
}

/** fetch cu timeout și parsare JSON tolerantă. status 0 = eroare de rețea / timeout. */
export async function httpJson(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<HttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    return { status: res.status, data, text };
  } catch (e) {
    return { status: 0, data: null, text: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Normalizează '2026-03-07 23:59:59' / '2026-03-07T…' → '2026-03-07'; null dacă nu e dată. */
export function isoDay(v: unknown): string | null {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** Eroare de autentificare care cere acțiunea utilizatorului (parolă greșită, cod 2FA). */
export class AuthRequiredError extends Error {
  constructor(
    message: string,
    public readonly reason: 'bad_credentials' | 'mfa' | 'no_credentials',
  ) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}
