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

/** Acceptă atât '123,45' cât și '123.45'. Returnează null dacă nu e un număr valid. */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}
