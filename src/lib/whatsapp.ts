import { formatDate, formatNumber } from './format';

/** '0744 123 456' / '+40744123456' / '0040744...' → '40744123456' (format wa.me). */
export function normalizeRoPhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `40${digits.slice(1)}`;
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

export interface WaterLine {
  label: string;
  value: number;
  unit: string;
}

export function buildWaterMessage(identification: string, date: string, lines: WaterLine[]): string {
  const header = identification.trim()
    ? `Bună ziua! Indexuri apă rece – ${identification.trim()}, ${formatDate(date)}:`
    : `Bună ziua! Indexuri apă rece, ${formatDate(date)}:`;
  const body = lines.map((l) => `${l.label}: ${formatNumber(l.value, 3)} ${l.unit}`);
  return [header, ...body].join('\n');
}
