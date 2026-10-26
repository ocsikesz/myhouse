import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { MeterCamera } from '@/components/MeterCamera';
import { Button } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import type { MeterExpectation, Rect } from '@/lib/meterOcr';
import { readMeterPhoto, type ScanResult } from '@/lib/scanMeter';
import { useTheme } from '@/lib/theme';

/**
 * Buton „Fotografiază și citește”: face poza, recunoaște indexul și îl pune
 * în câmp. Dacă OCR-ul găsește mai multe numere, le arată ca variante de ales.
 */
export function ScanButton({
  prefix,
  expectation,
  decimals,
  unit,
  onPhoto,
  onValue,
}: {
  prefix: string;
  expectation: MeterExpectation;
  /** Câte zecimale afișăm în câmp (0 pentru gaz/curent la furnizor) */
  decimals: number;
  unit: string;
  onPhoto: (uri: string) => void;
  onValue: (text: string) => void;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);

  const toText = (v: number) => (decimals === 0 ? String(Math.trunc(v)) : formatNumber(v, decimals).replace(/\./g, ''));

  async function onCapture(photo: { uri: string; region: Rect }) {
    setCamera(false);
    setBusy(true);
    try {
      const r = await readMeterPhoto(photo.uri, expectation, photo.region);
      setResult(r);
      onPhoto(r.photoUri);
      if (r.candidates[0]) {
        setPicked(0);
        onValue(toText(r.candidates[0].value));
      } else {
        setPicked(null);
      }
    } finally {
      setBusy(false);
    }
  }

  function choose(i: number) {
    if (!result) return;
    setPicked(i);
    onValue(toText(result.candidates[i].value));
  }

  return (
    <View style={{ gap: 8 }}>
      <MeterCamera visible={camera} prefix={prefix} onCancel={() => setCamera(false)} onCapture={onCapture} />
      <View style={styles.row}>
        <Button
          title={result ? 'Fă altă poză' : 'Fotografiază și citește'}
          variant="secondary"
          onPress={() => setCamera(true)}
          loading={busy}
          style={{ flex: 1 }}
        />
        {result ? <Image source={{ uri: result.photoUri }} style={styles.thumb} /> : null}
      </View>
      {result?.error ? <Text style={{ color: t.warning, fontSize: 13 }}>{result.error}</Text> : null}
      {result && result.candidates.length > 0 ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            {result.candidates.length > 1 ? 'Am citit, verifică cu contorul. Atinge altă variantă dacă e greșit:' : 'Am citit, verifică cu contorul:'}
          </Text>
          <View style={styles.chips}>
            {result.candidates.map((c, i) => {
              const active = i === picked;
              return (
                <Pressable
                  key={`${c.value}-${i}`}
                  onPress={() => choose(i)}
                  style={[
                    styles.chip,
                    { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : 'transparent' },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, { color: active ? t.surface : t.text }]}>
                    {formatNumber(c.value, decimals === 0 ? 0 : Math.min(decimals, 3))} {unit}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 46, height: 46, borderRadius: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
