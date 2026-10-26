import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { MonthPoint } from '@/lib/yearStats';

const LUNI = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const LUNI_LUNG = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];

/**
 * Anul curent (bare pline) peste anul trecut (contur). Atingerea unei luni
 * afișează valorile exacte și diferența.
 */
export function YearChart({
  points,
  year,
  color,
  unit,
  decimals = 0,
  currentMonth,
}: {
  points: MonthPoint[];
  year: number;
  color: string;
  unit: string;
  decimals?: number;
  currentMonth: number;
}) {
  const t = useTheme();
  const lastWithData = [...points].reverse().find((p) => p.current !== null)?.month ?? currentMonth;
  const [selected, setSelected] = useState<number>(lastWithData);
  const max = Math.max(0, ...points.flatMap((p) => [p.current ?? 0, p.previous ?? 0]));
  const hasAny = points.some((p) => p.current !== null || p.previous !== null);

  if (!hasAny) {
    return <Text style={{ color: t.textMuted }}>Furnizorul nu a trimis încă date de consum pentru perioada asta.</Text>;
  }

  const sel = points[selected - 1];
  const diff =
    sel.current !== null && sel.previous !== null && sel.previous > 0
      ? Math.round(((sel.current - sel.previous) / sel.previous) * 100)
      : null;
  const h = (v: number | null) => (v !== null && max > 0 ? Math.max(3, (v / max) * 100) : 0);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text style={[styles.readout, { color: t.text }]}>
          {sel.current !== null ? `${formatNumber(sel.current, decimals)} ${unit}` : '—'}
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          {LUNI_LUNG[selected - 1]} {year}
          {sel.previous !== null ? `, față de ${formatNumber(sel.previous, decimals)} ${unit} în ${year - 1}` : ''}
          {diff !== null ? ` (${diff > 0 ? '+' : ''}${diff}%)` : ''}
        </Text>
      </View>

      <View style={styles.chart}>
        <View style={[styles.gridLine, { borderColor: t.border, bottom: '50%' }]} />
        {points.map((p) => {
          const active = p.month === selected;
          const future = p.month > currentMonth;
          return (
            <Pressable
              key={p.month}
              style={styles.col}
              onPress={() => setSelected(p.month)}
              accessibilityRole="button"
              accessibilityLabel={`${LUNI_LUNG[p.month - 1]}: ${p.current ?? 'fără date'}`}
            >
              <View style={styles.barArea}>
                {p.previous !== null && (
                  <View style={[styles.ghost, { height: `${h(p.previous)}%`, borderColor: t.textMuted }]} />
                )}
                {p.current !== null && (
                  <View
                    style={[
                      styles.bar,
                      { height: `${h(p.current)}%`, backgroundColor: color, opacity: active ? 1 : 0.6 },
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  { color: active ? t.text : future ? t.border : t.textMuted, fontWeight: active ? '700' : '400' },
                ]}
              >
                {LUNI[p.month - 1]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{year}</Text>
        <View style={[styles.swatch, styles.swatchGhost, { borderColor: t.textMuted }]} />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{year - 1}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 3 },
  gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed' },
  col: { flex: 1, height: '100%', alignItems: 'center', gap: 4 },
  barArea: { flex: 1, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  ghost: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  bar: { width: '64%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  label: { fontSize: 10 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  swatchGhost: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', marginLeft: 10 },
});
