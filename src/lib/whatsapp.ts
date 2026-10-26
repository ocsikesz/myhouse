import { formatDate } from './format';

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
  /** Indexul de la citirea anterioară (luna trecută); null dacă nu există */
  previous: number | null;
  unit: string;
}

/** Index întreg, fără zecimale și fără separatoare: 123,456 → '123'. */
export function wholeIndex(value: number): string {
  return String(Math.trunc(value));
}

/**
 * Mesajul pentru reprezentantul firmei de apă: indexurile întregi (fără cele
 * 3 zecimale), totalul pe luna aceasta și pe luna trecută și consumul în m³.
 */
export function buildWaterMessage(identification: string, date: string, lines: WaterLine[]): string {
  const header = identification.trim()
    ? `Bună ziua! Indexuri apă rece – ${identification.trim()}, ${formatDate(date)}:`
    : `Bună ziua! Indexuri apă rece, ${formatDate(date)}:`;
  const unit = lines[0]?.unit ?? 'm³';
  const out = [header, ...lines.map((l) => `${l.label}: ${wholeIndex(l.value)} ${l.unit}`)];

  const total = lines.reduce((a, l) => a + Math.trunc(l.value), 0);
  const hasPrevious = lines.length > 0 && lines.every((l) => l.previous !== null);
  if (lines.length > 1 || hasPrevious) {
    out.push('');
    out.push(`Total luna aceasta: ${total} ${unit}`);
  }
  if (hasPrevious) {
    const totalPrev = lines.reduce((a, l) => a + Math.trunc(l.previous as number), 0);
    out.push(`Total luna trecută: ${totalPrev} ${unit}`);
    out.push(`Consum: ${total - totalPrev} ${unit}`);
  }
  return out.join('\n');
}
