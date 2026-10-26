import { StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '@/lib/format';
import { useTheme } from '@/lib/theme';

const LUNI_SCURT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface Bar {
  month: string;
  value: number | null;
}

/** Grafic simplu cu bare pe luni, fără biblioteci. Bara cea mai recentă e evidențiată. */
export function BarChart({ bars, color, unit, decimals = 0 }: { bars: Bar[]; color: string; unit: string; decimals?: number }) {
  const t = useTheme();
  const max = Math.max(0, ...bars.map((b) => b.value ?? 0));
  const known = bars.filter((b) => b.value !== null) as { month: string; value: number }[];
  const avg = known.length ? known.reduce((s, b) => s + b.value, 0) / known.length : null;

  if (known.length === 0) {
    return <Text style={{ color: t.textMuted }}>Încă nu sunt destule citiri pentru grafic.</Text>;
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.chart}>
        {bars.map((b, i) => {
          const h = max > 0 && b.value !== null ? Math.max(2, (b.value / max) * 100) : 0;
          const last = i === bars.length - 1;
          return (
            <View key={b.month} style={styles.col}>
              <View style={styles.barArea}>
                {b.value === null ? (
                  <View style={[styles.empty, { borderColor: t.border }]} />
                ) : (
                  <View style={[styles.bar, { height: `${h}%`, backgroundColor: color, opacity: last ? 1 : 0.55 }]} />
                )}
              </View>
              <Text style={[styles.label, { color: last ? t.text : t.textMuted }]}>
                {LUNI_SCURT[Number(b.month.slice(5, 7)) - 1]}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={{ color: t.textMuted, fontSize: 13 }}>
        Luna aceasta: {bars[bars.length - 1].value !== null ? `${formatNumber(bars[bars.length - 1].value!, decimals)} ${unit}` : '—'}
        {avg !== null ? ` · medie ${formatNumber(avg, decimals)} ${unit}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 },
  col: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barArea: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  empty: { width: '100%', height: 2, borderTopWidth: 1, borderStyle: 'dashed' },
  label: { fontSize: 10 },
});
