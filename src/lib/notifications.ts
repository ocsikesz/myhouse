import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { getSetting, setSetting } from '@/db/repo';

import { todayIso } from './format';
import { loadTasks } from './loadTasks';
import { notificationKey } from './tasks';

export const CHANNEL_ID = 'reminders';

/** Ore în care avem voie să trimitem notificări (ora locală). */
const QUIET_BEFORE = 8;
const QUIET_FROM = 21;

export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationSetup(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminder-e utilități',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Trimite notificările pentru sarcinile curente, fiecare o singură dată
 * (sau o dată pe zi, după caz). Returnează câte notificări a trimis.
 */
export async function sendDueNotifications(db: SQLiteDatabase, now = new Date()): Promise<number> {
  const hour = now.getHours();
  if (hour < QUIET_BEFORE || hour >= QUIET_FROM) return 0;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return 0;

  const today = todayIso();
  const tasks = await loadTasks(db);
  let sent = 0;
  for (const task of tasks) {
    const key = notificationKey(task, today);
    if (!key) continue;
    if (await getSetting(db, key)) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: task.title,
        body: task.body,
        data: { url: task.url },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
    await setSetting(db, key, now.toISOString());
    sent++;
  }
  return sent;
}
