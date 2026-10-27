// Definirea task-ului de fundal trebuie să ruleze la încărcarea modulului
import '@/background/task';

import * as Notifications from 'expo-notifications';
import { router, Stack, type Href } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useSQLiteContext } from 'expo-sqlite';
import { Suspense, useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { registerBackgroundTask } from '@/background/task';
import { cloudSync } from '@/cloud/sync';
import { DB_NAME, migrateDb } from '@/db/migrations';
import { configureNotificationHandler, ensureNotificationSetup } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';

configureNotificationHandler();

function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

/** Deschide ecranul din notificare (inclusiv când aplicația pornește din notificare). */
function NotificationRouter() {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) {
      // Lăsăm navigatorul să se monteze înainte de push
      setTimeout(() => router.push(url as Href), 0);
    }
  }, [response]);

  useEffect(() => {
    ensureNotificationSetup().catch(() => {});
    registerBackgroundTask().catch(() => {});
  }, []);

  return null;
}

/** Sincronizare cu familia la pornire și de fiecare dată când aplicația revine în față. */
function CloudSyncOnForeground() {
  const db = useSQLiteContext();
  useEffect(() => {
    cloudSync(db).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') cloudSync(db).catch(() => {});
    });
    return () => sub.remove();
  }, [db]);
  return null;
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <Suspense fallback={<Loading />}>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrateDb} useSuspense>
        <StatusBar style="auto" />
        <NotificationRouter />
        <CloudSyncOnForeground />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.background },
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '700' },
            headerTintColor: t.text,
            contentStyle: { backgroundColor: t.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="familie" options={{ title: 'Familie și backup' }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
