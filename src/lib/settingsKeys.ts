/** Chei pentru tabela `settings`. */
export const SETTINGS = {
  waterPhone: 'water.whatsapp_phone',
  waterIdentification: 'water.identification',
  /** Ziua din lună de la care apare reminder-ul pentru apă (1–28) */
  waterReminderDay: 'water.reminder_day',
  /** Ziua din lună până la care trebuie dat indexul la apă (1–31); lipsă = fără termen */
  waterDeadlineDay: 'water.deadline_day',
  /** Ziua din lună a scadenței la asociație, folosită când luna nu are scadență proprie */
  assocDueDay: 'assoc.due_day',
  /** Luna (YYYY-MM) pentru care indexul de apă a fost trimis */
  waterSentMonth: 'water.sent_month',
} as const;
