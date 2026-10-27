import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button, Field, Sheet } from '@/components/ui';
import { addReading, listReadings, markReadingSent } from '@/db/repo';
import type { Meter } from '@/db/types';
import { checkBackdatedReading } from '@/lib/consumption';
import { info } from '@/lib/dialogs';
import { addMonths, formatDate, parseDecimal, parseRoDate, todayIso } from '@/lib/format';
import { copyToGallery, deletePhoto, pickMeterPhoto, takeMeterPhoto } from '@/lib/photos';
import { tint, useTheme } from '@/lib/theme';

/**
 * Adaugă o citire de apă pe o dată din trecut (luna trecută, acum două luni…):
 * contorul, data, indexul, opțional poza, și dacă a fost deja trimisă.
 */
export function OldReadingSheet({
  visible,
  meters,
  labelOf,
  onClose,
  onSaved,
}: {
  visible: boolean;
  meters: Meter[];
  labelOf: (m: Meter) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTheme();
  const db = useSQLiteContext();
  const [meterId, setMeterId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [value, setValue] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [sent, setSent] = useState(true);
  const [busy, setBusy] = useState(false);

  // La fiecare deschidere: primul contor, aceeași zi de luna trecută
  useEffect(() => {
    if (!visible) return;
    const today = todayIso();
    setMeterId(meters[0]?.id ?? null);
    setDate(formatDate(`${addMonths(today.slice(0, 7), -1)}-${today.slice(8, 10) > '28' ? '28' : today.slice(8, 10)}`));
    setValue('');
    setPhoto(null);
    setSent(true);
  }, [visible, meters]);

  function close(keepPhoto = false) {
    if (!keepPhoto) deletePhoto(photo);
    onClose();
  }

  async function choosePhoto(source: 'galerie' | 'camera') {
    const uri = source === 'galerie' ? await pickMeterPhoto(meterId ?? 'apa') : await takeMeterPhoto(meterId ?? 'apa');
    if (!uri) return;
    deletePhoto(photo);
    setPhoto(uri);
  }

  async function onSave() {
    const meter = meters.find((m) => m.id === meterId);
    if (!meter) return;
    const iso = parseRoDate(date);
    if (!iso) {
      info('Dată invalidă', 'Scrie data în formatul ZZ.LL.AAAA, de ex. 20.09.2026');
      return;
    }
    const v = parseDecimal(value);
    if (v === null) {
      info('Index invalid', 'Introdu indexul în m³ întregi.');
      return;
    }
    const whole = Math.trunc(v);
    const history = (await listReadings(db, meter.id, 500)).map((r) => ({ value: Math.trunc(r.value), read_at: r.read_at }));
    const check = checkBackdatedReading(whole, iso, history, todayIso());
    if (!check.ok) {
      info(
        'Indexul nu se potrivește',
        check.reason === 'viitor'
          ? 'Data e în viitor.'
          : check.reason === 'mai_mic'
            ? `Pe ${formatDate(check.neighbor.date)} indexul era deja ${check.neighbor.value} m³; unul de mai târziu nu poate fi mai mic.`
            : `Pe ${formatDate(check.neighbor.date)} indexul a fost ${check.neighbor.value} m³; unul de mai devreme nu poate fi mai mare.`,
      );
      return;
    }
    setBusy(true);
    try {
      const id = await addReading(db, { meterId: meter.id, value: whole, readAt: iso, photoUri: photo });
      if (sent) await markReadingSent(db, id, `${iso}T12:00:00.000Z`);
      await copyToGallery(db, photo, labelOf(meter), iso);
      close(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={() => close()} title="Adaugă o citire mai veche">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
        <View style={styles.chips}>
          {meters.map((m) => {
            const active = m.id === meterId;
            return (
              <Pressable
                key={m.id}
                onPress={() => setMeterId(m.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, { borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : 'transparent' }]}
              >
                <Text style={[styles.chipText, { color: active ? t.onAccent : t.text }]}>{labelOf(m)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Field
          label="Data citirii"
          value={date}
          onChangeText={setDate}
          keyboardType="numbers-and-punctuation"
          placeholder="ZZ.LL.AAAA"
        />
        <Field label="Indexul (m³ întregi)" value={value} onChangeText={setValue} keyboardType="number-pad" placeholder="0" large />
        <View style={styles.row}>
          <Button title="Din galerie" icon="image-outline" variant="secondary" onPress={() => choosePhoto('galerie')} style={{ flex: 1 }} />
          <Button title="Cameră" icon="camera-outline" variant="secondary" onPress={() => choosePhoto('camera')} style={{ flex: 1 }} />
          {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : null}
        </View>
        <View style={[styles.row, styles.switchRow, { backgroundColor: tint(t.accent, 0.06) }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchTitle, { color: t.text }]}>Trimis deja</Text>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>
              Oprește dacă indexul ăsta n-a fost trimis reprezentantului.
            </Text>
          </View>
          <Switch value={sent} onValueChange={setSent} trackColor={{ true: t.accent }} thumbColor={sent ? t.onAccent : undefined} />
        </View>
        <Button title="Salvează citirea" icon="content-save-outline" onPress={onSave} loading={busy} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 48, height: 48, borderRadius: 10 },
  switchRow: { padding: 12, borderRadius: 14, gap: 12 },
  switchTitle: { fontSize: 15, fontWeight: '700' },
});
