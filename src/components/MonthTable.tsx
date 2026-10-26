import { StyleSheet, Text, View } from 'react-native';

import { formatLei, formatMonth, formatNumber } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { MonthBreakdown } from '@/lib/yearStats';

/** Tabelul pe luni: luna, index și consum, facturat și plătit. */
export function MonthTable({ rows, unit }: { rows: MonthBreakdown[]; unit: string }) {
  const t = useTheme();
  if (rows.length === 0) return <Text style={{ color: t.textMuted }}>Nicio dată pentru anul acesta încă.</Text>;
  return (
    <View>
      {rows.map((r, i) => {
        const month = formatMonth(r.month).split(' ')[0];
        const details = [
          r.consumption !== null ? `consum ${formatNumber(r.consumption, 0)} ${unit}` : null,
          r.index !== null ? `index ${formatNumber(r.index, 0)}` : null,
        ].filter(Boolean);
        return (
          <View
            key={r.month}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, { color: t.text }]}>{month.charAt(0).toUpperCase() + month.slice(1)}</Text>
              <Text style={[styles.meta, { color: t.textMuted }]}>{details.length ? details.join(' · ') : 'fără citire'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={[styles.amount, { color: t.text }]}>{r.billed !== null ? formatLei(r.billed) : '—'}</Text>
              {r.unpaid > 0.009 ? (
                <Text style={[styles.meta, { color: t.warning }]}>de plată {formatLei(r.unpaid)}</Text>
              ) : r.paid !== null ? (
                <Text style={[styles.meta, { color: t.success }]}>plătit {formatLei(r.paid)}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
      <Text style={[styles.meta, { color: t.textMuted, marginTop: 6 }]}>
        Suma din dreapta = facturile emise în luna respectivă; „plătit” = plățile făcute în luna aceea.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13 },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
