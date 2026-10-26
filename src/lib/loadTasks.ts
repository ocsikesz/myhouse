import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, listAssociationPayments, listMeters, listProviderStatuses } from '@/db/repo';

import { currentMonth, todayIso } from './format';
import { SETTINGS } from './settingsKeys';
import { computeTasks, type HomeTask } from './tasks';

const AUTH_HINTS = ['2FA', 'parolă greșită', 'Reconectează', 'email sau parolă'];

/** Adună din DB tot ce trebuie pentru lista „De făcut”. */
export async function loadTasks(db: SQLiteDatabase): Promise<HomeTask[]> {
  const today = todayIso();
  const month = currentMonth();
  const statuses = await listProviderStatuses(db);
  const meters = await listMeters(db);
  const payments = await listAssociationPayments(db, 1);
  const thisMonthPayment = payments[0]?.month === month ? payments[0] : null;

  const authErrors: { provider: 'eon' | 'electrica'; message: string }[] = [];
  for (const provider of ['eon', 'electrica'] as const) {
    const err = statuses.find((s) => s.provider === provider && s.error)?.error;
    if (err && AUTH_HINTS.some((h) => err.toLowerCase().includes(h.toLowerCase()))) {
      authErrors.push({ provider, message: err });
    }
  }

  return computeTasks({
    today,
    providers: statuses.map((s) => ({
      meterId: s.meter_id,
      name: s.name,
      unit: s.unit,
      inWindow: !!s.in_window,
      windowStart: s.window_start,
      windowEnd: s.window_end,
      submitted: s.submitted_index !== null,
      lastIndex: s.last_index,
      error: s.error,
    })),
    authErrors,
    water: {
      reminderDay: Number((await getSetting(db, SETTINGS.waterReminderDay)) ?? '20') || 20,
      sentThisMonth: (await getSetting(db, SETTINGS.waterSentMonth)) === month,
      hasMeters: meters.some((m) => m.kind === 'apa'),
    },
    association: thisMonthPayment
      ? {
          month: thisMonthPayment.month,
          amount: thisMonthPayment.amount,
          dueDate: thisMonthPayment.due_date,
          paid: !!thisMonthPayment.paid_at,
        }
      : null,
  });
}
