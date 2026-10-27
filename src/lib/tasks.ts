/**
 * Ce e de făcut acum — folosit și de panoul Acasă, și de notificările din fundal.
 * Funcții pure, fără acces la DB, ca să poată fi testate.
 */
import { daysBetween, formatDate, formatLei, formatMonth, formatNumber } from './format';

export interface ProviderInput {
  meterId: string;
  name: string;
  unit: string;
  inWindow: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  submitted: boolean;
  lastIndex: number | null;
  error: string | null;
}

export interface TaskInput {
  today: string;
  providers: ProviderInput[];
  /** Furnizori cu eroare de autentificare */
  authErrors: { provider: 'eon' | 'electrica'; message: string }[];
  water: {
    reminderDay: number;
    /** Ziua din lună până la care trebuie dat indexul (setată de utilizator); null = fără termen */
    deadlineDay?: number | null;
    sentThisMonth: boolean;
    hasMeters: boolean;
  };
  association: { month: string; amount: number; dueDate: string | null; paid: boolean } | null;
  /** Facturi E.ON / Electrica neplătite */
  invoices?: { meterId: string; name: string; number: string; unpaid: number; dueDate: string | null }[];
}

export type Urgency = 'urgent' | 'normal';

export interface HomeTask {
  /** Stabil pentru aceeași situație — folosit ca să nu trimitem aceeași notificare de două ori */
  key: string;
  title: string;
  body: string;
  url: string;
  urgency: Urgency;
  /** Notificare: o dată per cheie, sau o dată pe zi */
  notify: 'once' | 'daily' | 'never';
}

export function computeTasks(input: TaskInput): HomeTask[] {
  const { today } = input;
  const tasks: HomeTask[] = [];

  for (const e of input.authErrors) {
    tasks.push({
      key: `auth.${e.provider}`,
      title: `Reconectează contul ${e.provider === 'eon' ? 'E.ON' : 'Electrica'}`,
      body: e.message,
      url: `/cont/${e.provider}`,
      urgency: 'urgent',
      notify: 'daily',
    });
  }

  for (const p of input.providers) {
    if (!p.inWindow || p.submitted) continue;
    const daysLeft = p.windowEnd ? daysBetween(today, p.windowEnd) : null;
    const last = daysLeft !== null && daysLeft <= 1;
    const until = p.windowEnd ? ` până pe ${formatDate(p.windowEnd)}` : '';
    const prev = p.lastIndex !== null ? ` Ultimul index facturat: ${formatNumber(p.lastIndex, 0)} ${p.unit}.` : '';
    tasks.push({
      // Notificare zilnică cât timp fereastra e deschisă și indexul nu apare trimis
      key: `index.${p.meterId}.${p.windowStart ?? 'x'}`,
      title: last
        ? `${daysLeft! <= 0 ? 'Azi e ultima zi' : 'Mâine e ultima zi'}: index ${p.name}`
        : `Trimite indexul ${p.name}`,
      body: `Perioada de autocitire e deschisă${until}.${prev}`,
      url: `/contor/${encodeURIComponent(p.meterId)}`,
      urgency: last ? 'urgent' : 'normal',
      notify: 'daily',
    });
  }

  if (input.water.hasMeters && !input.water.sentThisMonth) {
    const day = Number(today.slice(8, 10));
    const deadlineDay = input.water.deadlineDay ?? null;
    const lastDay = daysInMonth(today);
    // Termenul nu poate trece de sfârșitul lunii (ex. 31 în noiembrie → 30)
    const deadline = deadlineDay !== null ? `${today.slice(0, 8)}${String(Math.min(deadlineDay, lastDay)).padStart(2, '0')}` : null;
    const daysLeft = deadline ? daysBetween(today, deadline) : null;
    const start = deadlineDay !== null ? Math.min(input.water.reminderDay, deadlineDay) : input.water.reminderDay;
    if (day >= start) {
      const urgent = daysLeft !== null && daysLeft <= 1;
      tasks.push({
        key: `water.${today.slice(0, 7)}`,
        title:
          daysLeft === null || daysLeft > 1
            ? 'Dă indexul la apă'
            : daysLeft === 1
              ? 'Mâine e termenul: indexul la apă'
              : daysLeft === 0
                ? 'Azi e termenul: indexul la apă'
                : 'Termenul pentru apă a trecut',
        body: `Citește contoarele de la bucătărie și baie și trimite-le pe WhatsApp.${deadline ? ` Termen: ${formatDate(deadline)}.` : ''}`,
        url: '/apa',
        urgency: urgent ? 'urgent' : 'normal',
        notify: 'daily',
      });
    }
  }

  for (const inv of input.invoices ?? []) {
    const daysLeft = inv.dueDate ? daysBetween(today, inv.dueDate) : null;
    const overdue = daysLeft !== null && daysLeft < 0;
    const near = daysLeft !== null && daysLeft <= 3;
    tasks.push({
      // Factură nouă: o notificare; aproape de scadență sau restantă: zilnic
      key: `invoice.${inv.meterId}.${inv.number}${near ? '.due' : ''}`,
      title: `${overdue ? 'Factură restantă' : 'Factură de plată'}: ${inv.name}, ${formatLei(inv.unpaid)}`,
      body:
        daysLeft === null
          ? 'Fără dată de scadență.'
          : overdue
            ? `Scadența a fost pe ${formatDate(inv.dueDate!)}.`
            : daysLeft === 0
              ? 'Scadența e azi.'
              : `Scadentă pe ${formatDate(inv.dueDate!)} (în ${daysLeft} ${daysLeft === 1 ? 'zi' : 'zile'}).`,
      url: `/contor/${encodeURIComponent(inv.meterId)}`,
      urgency: near ? 'urgent' : 'normal',
      notify: near ? 'daily' : 'once',
    });
  }

  const a = input.association;
  if (a && !a.paid) {
    const daysLeft = a.dueDate ? daysBetween(today, a.dueDate) : null;
    const nearDue = daysLeft !== null && daysLeft <= 3;
    tasks.push({
      key: `assoc.${a.month}`,
      title: `Plătește asociația: ${formatLei(a.amount)}`,
      body:
        daysLeft === null
          ? `Consumul pe ${formatMonth(a.month)}.`
          : daysLeft < 0
            ? `Scadența a trecut (${formatDate(a.dueDate!)}).`
            : daysLeft === 0
              ? 'Scadența e azi.'
              : `Scadență ${formatDate(a.dueDate!)} (în ${daysLeft} ${daysLeft === 1 ? 'zi' : 'zile'}).`,
      url: '/asociatie',
      urgency: nearDue ? 'urgent' : 'normal',
      notify: nearDue ? 'daily' : 'never',
    });
  }

  return tasks.sort((x, y) => (x.urgency === y.urgency ? 0 : x.urgency === 'urgent' ? -1 : 1));
}

function daysInMonth(isoDate: string): number {
  const [y, m] = isoDate.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Cheia sub care ținem minte că notificarea a fost trimisă. */
export function notificationKey(task: HomeTask, today: string): string | null {
  if (task.notify === 'never') return null;
  return task.notify === 'daily' ? `notif:${task.key}:${today}` : `notif:${task.key}`;
}
