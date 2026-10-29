import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/ui';
import { monthGrid } from '@/lib/calendar';
import { addMonths, formatMonth } from '@/lib/format';
import { useTheme } from '@/lib/theme';

const ZILE = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];

/**
 * Calendar lunar simplu (fără bibliotecă nativă): săgeți pentru lună, atingi ziua.
 * Zilele după `max` sunt dezactivate.
 */
export function DatePicker({
  value,
  month,
  onMonthChange,
  onChange,
  max,
}: {
  /** Ziua aleasă, YYYY-MM-DD */
  value: string;
  /** Luna afișată, YYYY-MM */
  month: string;
  onMonthChange: (month: string) => void;
  onChange: (date: string) => void;
  /** Ultima zi care se poate alege, YYYY-MM-DD */
  max: string;
}) {
  const t = useTheme();
  const title = formatMonth(month);
  return (
    <View style={[styles.box, { borderColor: t.border, backgroundColor: t.surfaceAlt }]}>
      <View style={styles.head}>
        <IconButton icon="chevron-left" label="Luna anterioară" onPress={() => onMonthChange(addMonths(month, -1))} />
        <Text style={[styles.title, { color: t.text }]}>{title.charAt(0).toUpperCase() + title.slice(1)}</Text>
        <IconButton
          icon="chevron-right"
          label="Luna următoare"
          disabled={month >= max.slice(0, 7)}
          onPress={() => onMonthChange(addMonths(month, 1))}
        />
      </View>
      <View style={styles.row}>
        {ZILE.map((z) => (
          <Text key={z} style={[styles.dow, { color: t.textMuted }]}>
            {z}
          </Text>
        ))}
      </View>
      {monthGrid(month).map((week, i) => (
        <View key={i} style={styles.row}>
          {week.map((c, j) => {
            if (!c.date) return <View key={j} style={styles.cell} />;
            const selected = c.date === value;
            const disabled = c.date > max;
            return (
              <Pressable
                key={j}
                disabled={disabled}
                onPress={() => onChange(c.date!)}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={c.date}
                style={styles.cell}
              >
                <View style={[styles.dayBubble, selected && { backgroundColor: t.accent }]}>
                  <Text
                    style={[
                      styles.day,
                      { color: selected ? t.onAccent : disabled ? t.border : t.text },
                      selected && { fontWeight: '800' },
                    ]}
                  >
                    {c.day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 8, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  dayBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 15, fontVariant: ['tabular-nums'] },
});
