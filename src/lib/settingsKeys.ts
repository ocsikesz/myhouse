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

/** Setări comune familiei — se sincronizează între telefoane. Restul rămân pe telefon. */
export const SHARED_SETTINGS: readonly string[] = [
  SETTINGS.waterPhone,
  SETTINGS.waterIdentification,
  SETTINGS.waterReminderDay,
  SETTINGS.waterDeadlineDay,
  SETTINGS.assocDueDay,
  SETTINGS.waterSentMonth,
];

/** Setări doar pentru telefonul ăsta. */
export const DEVICE = {
  /** '0' = fără notificări pe telefonul ăsta */
  notifications: 'device.notifications',
  /** '0' = telefonul ăsta nu se loghează la E.ON / Electrica (ia datele din cloud) */
  providerSync: 'device.provider_sync',
  /** '0' = nu copia pozele contoarelor în Galerie (albumul Indexa) */
  saveToGallery: 'device.save_gallery',
} as const;
