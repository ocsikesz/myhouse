import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing, tint, useTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[t.accent]} tintColor={t.accent} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  const cardStyle = [styles.card, { backgroundColor: t.surface, borderColor: t.border }, style];
  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [...cardStyle, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
        android_ripple={{ color: tint(t.accent, 0.08) }}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: t.textMuted }]}>{children}</Text>
      {action}
    </View>
  );
}

export function Body({
  children,
  muted,
  color,
}: {
  children: ReactNode;
  muted?: boolean;
  color?: string;
}) {
  const t = useTheme();
  return (
    <Text style={[styles.body, { color: color ?? (muted ? t.textMuted : t.text) }]}>{children}</Text>
  );
}

export function Title({ children, color }: { children: ReactNode; color?: string }) {
  const t = useTheme();
  return <Text style={[styles.title, { color: color ?? t.text }]}>{children}</Text>;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** Iconiță într-un cerc colorat discret — semnul fiecărei utilități. */
export function IconBadge({ name, color, size = 40 }: { name: IconName; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        backgroundColor: tint(color, 0.14),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={name} size={Math.round(size * 0.55)} color={color} />
    </View>
  );
}

export function Icon({ name, color, size = 20 }: { name: IconName; color: string; size?: number }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

/** Antetul unui card: iconiță, titlu, subtitlu și ceva în dreapta (etichetă, săgeată). */
export function CardHeader({
  icon,
  color,
  title,
  subtitle,
  right,
}: {
  icon: IconName;
  color: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      <IconBadge name={icon} color={color} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Chevron() {
  const t = useTheme();
  return <MaterialCommunityIcons name="chevron-right" size={22} color={t.textMuted} />;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerSoft' | 'whatsapp';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  icon?: IconName;
}) {
  const t = useTheme();
  const bg: Record<ButtonVariant, string> = {
    primary: t.accent,
    secondary: tint(t.accent, 0.1),
    danger: t.danger,
    dangerSoft: tint(t.danger, 0.1),
    whatsapp: t.whatsapp,
  };
  const fgMap: Record<ButtonVariant, string> = {
    primary: t.onAccent,
    secondary: t.accent,
    danger: t.surface,
    dangerSoft: t.danger,
    whatsapp: '#FFFFFF',
  };
  const fg = fgMap[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg[variant], opacity: isDisabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <MaterialCommunityIcons name={icon} size={19} color={fg} /> : null}
          {title ? (
            <Text style={[styles.buttonText, { color: fg }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/** Buton rotund doar cu iconiță (șterge, înapoi, înainte). */
export function IconButton({
  icon,
  onPress,
  color,
  disabled,
  label,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  label: string;
}) {
  const t = useTheme();
  const c = color ?? t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: tint(c, pressed ? 0.2 : 0.1), opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={c} />
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  hint,
  autoCapitalize = 'none',
  large,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  hint?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  /** Cifre mari, pentru index */
  large?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tint(t.textMuted, 0.6)}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[
          styles.input,
          large && styles.inputLarge,
          { color: t.text, borderColor: t.border, backgroundColor: t.surfaceAlt },
        ]}
      />
      {hint ? <Text style={[styles.hint, { color: t.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

/** Etichetă de stare: text colorat pe nuanța aceleiași culori. */
export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: tint(color, 0.14) }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: spacing.xs }} />;
}

/**
 * Foaie care urcă de jos, peste ecran. Atingerea fundalului sau butonul
 * Înapoi o închid.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetWrap}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Închide" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: t.surface, paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: t.border }]} />
          {title ? <Text style={[styles.sheetTitle, { color: t.text }]}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Rând de acțiune într-o foaie: iconiță + text, pe toată lățimea. */
export function SheetAction({
  icon,
  label,
  onPress,
  color,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  const c = color ?? t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.sheetAction,
        { backgroundColor: pressed ? t.surfaceAlt : 'transparent', opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <IconBadge name={icon} color={color ?? t.accent} size={36} />
      <Text style={[styles.body, { color: c, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.md, gap: 12, paddingBottom: spacing.lg * 2 },
  card: { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.sm },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  body: { fontSize: 15, lineHeight: 21 },
  meta: { fontSize: 13, lineHeight: 18 },
  title: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  iconButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 17 },
  inputLarge: { fontSize: 26, fontWeight: '700', letterSpacing: 1, fontVariant: ['tabular-nums'], paddingVertical: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    gap: 6,
    maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  sheetAction: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12 },
});
