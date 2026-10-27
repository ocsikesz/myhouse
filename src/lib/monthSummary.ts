/**
 * Rezumatul lunii pentru Acasă: consum pe utilități și cost. Funcții pure.
 */

export interface ConsumptionRow {
  /** YYYY-MM */
  month: string;
  consumption: number | null;
}

export interface KindConsumption {
  /** Suma pe toate contoarele de acel tip; null dacă nu există date */
  value: number | null;
  /** Luna din care e valoarea (YYYY-MM); poate fi mai veche decât luna curentă */
  month: string | null;
}

/**
 * Consumul unui tip de utilitate (ex. toate contoarele de gaz) pentru luna
 * cerută. Furnizorii raportează consumul cu întârziere, așa că dacă luna nu
 * are încă date, luăm cea mai recentă lună de dinainte care are.
 */
export function kindConsumption(perMeter: ConsumptionRow[][], month: string): KindConsumption {
  const rows = perMeter.flat().filter((r) => r.consumption !== null && r.month <= month);
  if (rows.length === 0) return { value: null, month: null };
  const latest = rows.reduce((m, r) => (r.month > m ? r.month : m), rows[0].month);
  const value = rows.filter((r) => r.month === latest).reduce((s, r) => s + (r.consumption ?? 0), 0);
  return { value: Math.round(value * 1000) / 1000, month: latest };
}

export interface MonthCost {
  total: number;
  eon: number;
  electrica: number;
  association: number;
}

/** Costul lunii: facturile E.ON / Electrica emise în luna respectivă + suma de la asociație. */
export function monthCost(
  invoices: { provider: string; issue_date: string | null; due_date: string | null; amount: number }[],
  associationAmount: number | null,
  month: string,
): MonthCost {
  const inMonth = invoices.filter((i) => (i.issue_date ?? i.due_date ?? '').startsWith(month));
  const sum = (p: string) => round2(inMonth.filter((i) => i.provider === p).reduce((s, i) => s + i.amount, 0));
  const eon = sum('eon');
  const electrica = sum('electrica');
  const association = round2(associationAmount ?? 0);
  return { total: round2(eon + electrica + association), eon, electrica, association };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Cât s-a plătit în lună: plățile la E.ON / Electrica făcute în luna respectivă
 * (dacă furnizorul nu dă plăți, facturile din lună marcate plătite) plus
 * asociația, dacă a fost marcată plătită în luna aceea.
 */
export function monthPaid(
  payments: { provider: string; paid_on: string; amount: number }[],
  invoices: { provider: string; issue_date: string | null; due_date: string | null; amount: number; paid: number | boolean }[],
  association: { amount: number; paid_at: string | null } | null,
  month: string,
): number {
  let total = 0;
  for (const provider of new Set([...payments, ...invoices].map((x) => x.provider))) {
    const p = payments.filter((x) => x.provider === provider);
    if (p.length > 0) {
      total += p.filter((x) => x.paid_on.startsWith(month)).reduce((s, x) => s + x.amount, 0);
    } else {
      total += invoices
        .filter((i) => i.provider === provider && i.paid && (i.issue_date ?? i.due_date ?? '').startsWith(month))
        .reduce((s, i) => s + i.amount, 0);
    }
  }
  if (association?.paid_at?.startsWith(month)) total += association.amount;
  return round2(total);
}

// ---------- Extrasul unei luni de consum ----------

interface InvoiceLike {
  issue_date: string | null;
  due_date: string | null;
  amount: number;
  unpaid: number;
  paid: number | boolean;
}

export interface StatementLine {
  /** Consumul din luna extrasului; null = fără date */
  consumption: number | null;
  /** Costul; null = încă nefacturat (sau, la apă, inclus în asociație) */
  cost: number | null;
  /** Cât s-a plătit din cost */
  paid: number;
}

export interface Statement {
  water: StatementLine;
  gas: StatementLine;
  electricity: StatementLine;
  association: StatementLine;
  total: number;
  paid: number;
  unpaid: number;
}

/** Consumul exact al lunii, adunat pe contoare; null dacă niciun contor n-are date pe luna asta. */
export function exactConsumption(perMeter: ConsumptionRow[][], month: string): number | null {
  const rows = perMeter.flat().filter((r) => r.month === month && r.consumption !== null);
  if (rows.length === 0) return null;
  return Math.round(rows.reduce((s, r) => s + (r.consumption ?? 0), 0) * 1000) / 1000;
}

/** '2026-09' → '2026-10' */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Factura pentru consumul unei luni e emisă în luna următoare
 * (consumul din septembrie → factura din octombrie).
 */
function billedFor(invoices: InvoiceLike[], month: string): { cost: number | null; paid: number } {
  const billing = nextMonth(month);
  const inv = invoices.filter((i) => (i.issue_date ?? i.due_date ?? '').startsWith(billing));
  if (inv.length === 0) return { cost: null, paid: 0 };
  const cost = round2(inv.reduce((s, i) => s + i.amount, 0));
  const unpaid = inv.reduce((s, i) => s + (i.paid ? 0 : Math.max(0, i.unpaid)), 0);
  return { cost, paid: round2(cost - unpaid) };
}

export function buildStatement(input: {
  month: string;
  water: ConsumptionRow[][];
  gas: ConsumptionRow[][];
  electricity: ConsumptionRow[][];
  gasInvoices: InvoiceLike[];
  electricityInvoices: InvoiceLike[];
  association: { amount: number; paid_at: string | null } | null;
}): Statement {
  const { month } = input;
  const gasBill = billedFor(input.gasInvoices, month);
  const elBill = billedFor(input.electricityInvoices, month);
  const lines = {
    // Apa rece se plătește prin asociație, deci n-are cost separat
    water: { consumption: exactConsumption(input.water, month), cost: null, paid: 0 },
    gas: { consumption: exactConsumption(input.gas, month), ...gasBill },
    electricity: { consumption: exactConsumption(input.electricity, month), ...elBill },
    association: {
      consumption: null,
      cost: input.association ? round2(input.association.amount) : null,
      paid: input.association?.paid_at ? round2(input.association.amount) : 0,
    },
  };
  const all = [lines.gas, lines.electricity, lines.association];
  const total = round2(all.reduce((s, l) => s + (l.cost ?? 0), 0));
  const paid = round2(all.reduce((s, l) => s + l.paid, 0));
  return { ...lines, total, paid, unpaid: round2(total - paid) };
}
