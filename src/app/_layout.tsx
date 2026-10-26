// Definirea task-ului de fundal trebuie să ruleze la încărcarea modulului
import '@/background/task';

import * as Notifications from 'expo-notifications';
import { router, Stack, type Href } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { registerBackgroundTask } from '@/background/task';
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

export default function RootLayout() {
  const t = useTheme();
  return (
    <Suspense fallback={<Loading />}>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrateDb} useSuspense>
        <StatusBar style="auto" />
        <NotificationRouter />
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
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}
