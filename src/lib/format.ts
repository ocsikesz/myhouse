/** Formatare românească: virgulă zecimală, punct pentru mii. */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('ro-RO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatLei(value: number): string {
  return `${formatNumber(value, 2)} lei`;
}

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];

/** '2026-10' → 'octombrie 2026' */
export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${LUNI[m - 1]} ${y}`;
}

/** '2026-10-26' → '26.10.2026' */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/** Data de azi ca YYYY-MM-DD, în ora locală. */
export function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Luna curentă ca YYYY-MM. */
export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

/** '26.10.2026' sau '26/10/2026' → '2026-10-26'; null dacă data nu e validă. */
export function parseRoDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Adună n luni (poate fi negativ): addMonths('2026-01', -1) → '2025-12' */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** '2026-10' → '2026-09' */
export function previousMonth(month: string): string {
  return addMonths(month, -1);
}

/** Diferența în zile calendaristice între două date YYYY-MM-DD (b − a). */
export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}

/** Acceptă atât '123,45' cât și '123.45'. Returnează null dacă nu e un număr valid. */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** ISO (UTC) → 'DD.MM.YYYY HH:MM' în ora locală a telefonului. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
