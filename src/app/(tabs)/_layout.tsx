import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/lib/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function icon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    // tabBarActive/InactiveTintColor sunt string-uri din temă, deci culoarea e mereu string
    <MaterialCommunityIcons name={name} color={color as string} size={size} />
  );
}

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.text,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Acasă', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="utilitati" options={{ title: 'Utilități', tabBarIcon: icon('gauge') }} />
      <Tabs.Screen name="istoric" options={{ title: 'Istoric', tabBarIcon: icon('chart-line') }} />
      <Tabs.Screen name="setari" options={{ title: 'Setări', tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}
