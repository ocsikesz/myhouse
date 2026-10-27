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

export interface MonthBreakdown {
  /** YYYY-MM */
  month: string;
  index: number | null;
  consumption: number | null;
  /** Suma facturilor emise în luna respectivă (null = nicio factură găsită) */
  billed: number | null;
  /** Rest de plată din facturile lunii */
  unpaid: number;
  /** Plățile făcute în luna respectivă */
  paid: number | null;
}

/**
 * Defalcarea pe luni a anului: index, consum, facturat și plătit.
 * Lunile fără niciun fel de date nu apar. Cea mai nouă lună prima.
 */
export function buildMonthBreakdown(
  year: number,
  monthly: { month: string; consumption: number | null; index_value: number | null }[],
  invoices: { issue_date: string | null; due_date: string | null; amount: number; unpaid: number; paid: number | boolean }[],
  payments: { paid_on: string; amount: number }[],
): MonthBreakdown[] {
  const y = String(year);
  const rows = new Map<string, MonthBreakdown>();
  const row = (month: string) => {
    let r = rows.get(month);
    if (!r) {
      r = { month, index: null, consumption: null, billed: null, unpaid: 0, paid: null };
      rows.set(month, r);
    }
    return r;
  };
  for (const m of monthly) {
    if (!m.month.startsWith(y) || (m.consumption === null && m.index_value === null)) continue;
    const r = row(m.month);
    if (m.consumption !== null) r.consumption = m.consumption;
    if (m.index_value !== null) r.index = m.index_value;
  }
  for (const inv of invoices) {
    const d = inv.issue_date ?? inv.due_date;
    if (!d?.startsWith(y)) continue;
    const r = row(d.slice(0, 7));
    r.billed = (r.billed ?? 0) + inv.amount;
    if (!inv.paid) r.unpaid += inv.unpaid;
  }
  for (const p of payments) {
    if (!p.paid_on.startsWith(y)) continue;
    const r = row(p.paid_on.slice(0, 7));
    r.paid = (r.paid ?? 0) + p.amount;
  }
  return [...rows.values()].sort((a, b) => b.month.localeCompare(a.month));
}

// ---------- Diferența de index pe factură ----------

export interface InvoiceIndex {
  /** Indexul anterior și cel de pe factură */
  from: number;
  to: number;
  /** Diferența (negativă la regularizare, când un index estimat e corectat de o citire reală) */
  delta: number;
  /** Câte luni acoperă (dacă lipsesc indexuri pe luni intermediare) */
  months: number;
  /** Indexul de pe factură e estimat de furnizor, nu citit */
  estimated: boolean;
}

function monthIndex(month: string): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
}

/**
 * Indexul pe care se bazează o factură și diferența față de indexul anterior.
 * `lagMonths`: E.ON facturează în aceeași lună cu indexul (0); Electrica emite
 * factura la începutul lunii următoare (1).
 */
export function invoiceIndexDelta(
  issueDate: string | null,
  monthly: { month: string; index_value: number | null; reading_type: string | null }[],
  lagMonths: 0 | 1,
): InvoiceIndex | null {
  if (!issueDate) return null;
  const target = monthIndex(issueDate.slice(0, 7)) - lagMonths;
  const withIndex = monthly
    .filter((m) => m.index_value !== null)
    .sort((a, b) => a.month.localeCompare(b.month));
  const cur = withIndex.find((m) => monthIndex(m.month) === target);
  if (!cur) return null;
  const prev = [...withIndex].reverse().find((m) => monthIndex(m.month) < target);
  if (!prev) return null;
  return {
    from: prev.index_value!,
    to: cur.index_value!,
    delta: Math.round((cur.index_value! - prev.index_value!) * 1000) / 1000,
    months: target - monthIndex(prev.month),
    estimated: (cur.reading_type ?? '').toLowerCase().includes('estimat'),
  };
}
