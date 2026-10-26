import type { Reading } from '@/db/types';

import { addMonths } from './format';

export interface MonthValue {
  month: string;
  value: number | null;
}

/**
 * Consum lunar din citiri cumulative (index). Consumul dintre două citiri
 * consecutive se atribuie lunii citirii mai noi. Lunile fără date rămân null.
 */
export function monthlyConsumption(readings: Reading[], lastMonth: string, count = 12): MonthValue[] {
  const asc = [...readings].sort((a, b) => (a.read_at === b.read_at ? a.id - b.id : a.read_at < b.read_at ? -1 : 1));
  const byMonth = new Map<string, number>();
  for (let i = 1; i < asc.length; i++) {
    const delta = asc[i].value - asc[i - 1].value;
    if (delta < 0) continue;
    const m = asc[i].read_at.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + delta);
  }
  const out: MonthValue[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(lastMonth, -i);
    const v = byMonth.get(m);
    out.push({ month: m, value: v === undefined ? null : Math.round(v * 1000) / 1000 });
  }
  return out;
}
