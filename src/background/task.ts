import * as BackgroundTask from 'expo-background-task';
import { openDatabaseAsync } from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { DB_NAME, migrateDb } from '@/db/migrations';
import { setSetting } from '@/db/repo';
import { sendDueNotifications } from '@/lib/notifications';
import { syncAll } from '@/providers/sync';

export const BACKGROUND_TASK = 'casamea-sync';
export const LAST_BACKGROUND_RUN = 'background.last_run';

/**
 * Rulează în fundal la câteva ore (Android decide momentul exact):
 * sincronizează E.ON / Electrica și trimite reminder-ele datorate.
 */
export async function runBackgroundCheck(): Promise<void> {
  const db = await openDatabaseAsync(DB_NAME);
  await migrateDb(db);
  await syncAll(db);
  await sendDueNotifications(db);
  await setSetting(db, LAST_BACKGROUND_RUN, new Date().toISOString());
}

// Trebuie definit la nivel de modul, înainte ca aplicația să se încarce
TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    await runBackgroundCheck();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundTask(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK)) return;
  // Minimum ~4 ore între rulări; fereastra de autocitire durează zile, nu ore
  await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, { minimumInterval: 240 });
}
