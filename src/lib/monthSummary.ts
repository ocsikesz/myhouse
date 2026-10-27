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
