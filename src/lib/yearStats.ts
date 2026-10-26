/** Comparație an curent vs anul trecut, lună de lună. Funcții pure. */

export interface MonthPoint {
  /** 1–12 */
  month: number;
  current: number | null;
  previous: number | null;
}

export interface YearComparison {
  year: number;
  points: MonthPoint[];
  /** Total an curent, până la luna curentă inclusiv */
  totalCurrent: number;
  /** Total an trecut, pe aceleași luni (comparație corectă) */
  totalPreviousSamePeriod: number;
  totalPreviousFull: number;
  /** Diferența procentuală față de aceeași perioadă de anul trecut; null dacă nu se poate calcula */
  deltaPct: number | null;
}

export function buildYearComparison(
  rows: { month: string; value: number | null }[],
  today: string,
): YearComparison {
  const year = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const get = (y: number, m: number) => {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const r = rows.find((x) => x.month === key);
    return r && r.value !== null ? r.value : null;
  };
  const points: MonthPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    current: i + 1 <= currentMonth ? get(year, i + 1) : null,
    previous: get(year - 1, i + 1),
  }));
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, v) => a + (v ?? 0), 0);
  const upTo = points.slice(0, currentMonth);
  // Comparăm doar lunile care au date în ambii ani
  const comparable = upTo.filter((p) => p.current !== null && p.previous !== null);
  const cur = sum(comparable.map((p) => p.current));
  const prev = sum(comparable.map((p) => p.previous));
  return {
    year,
    points,
    totalCurrent: sum(upTo.map((p) => p.current)),
    totalPreviousSamePeriod: sum(upTo.map((p) => p.previous)),
    totalPreviousFull: sum(points.map((p) => p.previous)),
    deltaPct: comparable.length > 0 && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
  };
}

export type InvoiceState = 'paid' | 'due' | 'overdue';

export function invoiceState(inv: { paid: number | boolean; unpaid: number; due_date: string | null }, today: string): InvoiceState {
  if (inv.paid || inv.unpaid <= 0.009) return 'paid';
  if (inv.due_date && inv.due_date < today) return 'overdue';
  return 'due';
}

/**
 * Totalul facturat într-un an. Două estimări:
 *  - din facturi: suma facturilor emise în an;
 *  - din plăți: plățile din an + ce e încă de plată din facturile anului.
 * Lista de facturi poate fi incompletă (API-ul dă uneori doar neplătitele, iar
 * cele marcate plătite local pot fi doar câteva), așa că o folosim doar dacă
 * acoperă cel puțin cât plățile; altfel arătăm estimarea din plăți.
 */
export function billedInYear(
  invoices: { issue_date: string | null; due_date: string | null; amount: number; unpaid: number; paid: number | boolean }[],
  payments: { paid_on: string; amount: number }[],
  year: number,
): { total: number; source: 'invoices' | 'payments' } {
  const y = String(year);
  const inYear = invoices.filter((i) => (i.issue_date ?? i.due_date ?? '').startsWith(y));
  const fromInvoices = round2(inYear.reduce((s, i) => s + i.amount, 0));
  const paid = payments.filter((p) => p.paid_on.startsWith(y)).reduce((s, p) => s + p.amount, 0);
  const open = inYear.filter((i) => !i.paid).reduce((s, i) => s + i.unpaid, 0);
  const fromPayments = round2(paid + open);
  if (invoices.some((i) => i.paid) && fromInvoices >= fromPayments) {
    return { total: fromInvoices, source: 'invoices' };
  }
  return { total: fromPayments, source: 'payments' };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
