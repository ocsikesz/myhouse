import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

/**
 * Indexul afișat ca tamburii unui contor mecanic: cifre albe pe celule
 * închise; zecimalele (dacă există) pe celule roșii, ca la contoarele de apă.
 */
export function MeterDrum({
  value,
  decimals = 0,
  minDigits = 5,
  unit,
  size = 'large',
}: {
  value: number | null;
  decimals?: number;
  minDigits?: number;
  unit: string;
  size?: 'large' | 'small';
}) {
  const t = useTheme();
  const big = size === 'large';
  const [intPart, decPart] =
    value === null ? ['-'.repeat(minDigits), decimals ? '-'.repeat(decimals) : ''] : value.toFixed(decimals).split('.');
  const digits = intPart.padStart(minDigits, '0').split('');
  const decs = (decPart ?? '').split('').filter(Boolean);
  const cell = big ? styles.cellLarge : styles.cellSmall;
  const text = big ? styles.digitLarge : styles.digitSmall;

  return (
    <View style={styles.row} accessibilityLabel={value === null ? 'Index necunoscut' : `Index ${value} ${unit}`}>
      <View style={[styles.window, { backgroundColor: t.drum }]}>
        {digits.map((d, i) => (
          <View key={`i${i}`} style={[cell, styles.cellBorder]}>
            <Text style={[text, { color: t.drumText }]}>{d}</Text>
          </View>
        ))}
        {decs.map((d, i) => (
          <View key={`d${i}`} style={[cell, { backgroundColor: t.drumDecimal }]}>
            <Text style={[text, { color: '#FFFFFF' }]}>{d}</Text>
          </View>
        ))}
      </View>
      <Text style={[big ? styles.unitLarge : styles.unitSmall, { color: t.textMuted }]}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  window: { flexDirection: 'row', borderRadius: 6, padding: 3, gap: 2 },
  cellBorder: { backgroundColor: 'rgba(255,255,255,0.06)' },
  cellLarge: { width: 30, height: 44, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  cellSmall: { width: 17, height: 25, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  digitLarge: { fontSize: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
  digitSmall: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unitLarge: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  unitSmall: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
});
