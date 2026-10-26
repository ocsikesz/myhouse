import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/lib/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Iconiță plină când tab-ul e activ, contur când nu */
function icon(active: IconName, inactive: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    // tabBarActive/InactiveTintColor sunt string-uri din temă, deci culoarea e mereu string
    <MaterialCommunityIcons name={focused ? active : inactive} color={color as string} size={size} />
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: t.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 22 },
        headerTintColor: t.text,
        sceneStyle: { backgroundColor: t.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'CasaMea', tabBarLabel: 'Acasă', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="utilitati" options={{ title: 'Utilități', tabBarIcon: icon('gauge', 'gauge-low') }} />
      <Tabs.Screen name="istoric" options={{ title: 'Istoric', tabBarIcon: icon('chart-box', 'chart-box-outline') }} />
      <Tabs.Screen name="setari" options={{ title: 'Setări', tabBarIcon: icon('cog', 'cog-outline') }} />
    </Tabs>
  );
}
