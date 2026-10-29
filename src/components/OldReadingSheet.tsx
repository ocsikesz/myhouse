import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { DatePicker } from '@/components/DatePicker';
import { Button, Field, Sheet } from '@/components/ui';
import { addReading, listReadings, markReadingSent } from '@/db/repo';
import type { Meter } from '@/db/types';
import { checkBackdatedReading } from '@/lib/consumption';
import { info } from '@/lib/dialogs';
import { addMonths, formatDate, parseDecimal, todayIso } from '@/lib/format';
import { copyToGallery, deletePhoto, pickMeterPhoto, takeMeterPhoto } from '@/lib/photos';
import { tint, useTheme } from '@/lib/theme';

/**
 * Adaugă citiri de apă pe o dată din trecut, pentru toate contoarele odată:
 * alegi ziua din calendar, completezi indexul (și poza) la bucătărie și la baie,
 * apoi salvezi o singură dată. Contoarele lăsate goale nu se salvează.
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
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [values, setValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [sent, setSent] = useState(true);
  const [busy, setBusy] = useState(false);

  // La fiecare deschidere: aceeași zi de luna trecută, câmpuri goale
  useEffect(() => {
    if (!visible) return;
    const t0 = todayIso();
    const prevMonth = addMonths(t0.slice(0, 7), -1);
    const lastDay = new Date(Number(prevMonth.slice(0, 4)), Number(prevMonth.slice(5, 7)), 0).getDate();
    const day = Math.min(Number(t0.slice(8, 10)), lastDay);
    setDate(`${prevMonth}-${String(day).padStart(2, '0')}`);
    setMonth(prevMonth);
    setValues({});
    setPhotos({});
    setSent(true);
  }, [visible]);

  function close(keepPhotos = false) {
    if (!keepPhotos) Object.values(photos).forEach((p) => deletePhoto(p ?? null));
    onClose();
  }

  async function choosePhoto(meter: Meter, source: 'galerie' | 'camera') {
    const uri = source === 'galerie' ? await pickMeterPhoto(meter.id) : await takeMeterPhoto(meter.id);
    if (!uri) return;
    deletePhoto(photos[meter.id] ?? null);
    setPhotos((p) => ({ ...p, [meter.id]: uri }));
  }

  async function onSave() {
    const toSave: { meter: Meter; value: number }[] = [];
    for (const m of meters) {
      const raw = values[m.id]?.trim();
      if (!raw) continue;
      const v = parseDecimal(raw);
      if (v === null) {
        info('Index invalid', `${labelOf(m)}: „${raw}” nu e un număr.`);
        return;
      }
      const whole = Math.trunc(v);
      const history = (await listReadings(db, m.id, 500)).map((r) => ({ value: Math.trunc(r.value), read_at: r.read_at }));
      const check = checkBackdatedReading(whole, date, history, todayIso());
      if (!check.ok) {
        info(
          `${labelOf(m)}: indexul nu se potrivește`,
          check.reason === 'viitor'
            ? 'Data e în viitor.'
            : check.reason === 'mai_mic'
              ? `Pe ${formatDate(check.neighbor.date)} indexul era deja ${check.neighbor.value} m³; unul de mai târziu nu poate fi mai mic.`
              : `Pe ${formatDate(check.neighbor.date)} indexul a fost ${check.neighbor.value} m³; unul de mai devreme nu poate fi mai mare.`,
        );
        return;
      }
      toSave.push({ meter: m, value: whole });
    }
    if (toSave.length === 0) {
      info('Nimic de salvat', 'Completează indexul la cel puțin un contor.');
      return;
    }

    setBusy(true);
    try {
      await db.withTransactionAsync(async () => {
        for (const { meter, value } of toSave) {
          const id = await addReading(db, { meterId: meter.id, value, readAt: date, photoUri: photos[meter.id] ?? null });
          if (sent) await markReadingSent(db, id, `${date}T12:00:00.000Z`);
        }
      });
      for (const { meter } of toSave) await copyToGallery(db, photos[meter.id] ?? null, labelOf(meter), date);
      // Pozele contoarelor lăsate goale nu mai trebuie păstrate
      for (const m of meters) if (!toSave.some((s) => s.meter.id === m.id)) deletePhoto(photos[m.id] ?? null);
      close(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={() => close()} title="Adaugă citiri mai vechi">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
        <DatePicker value={date} month={month} onMonthChange={setMonth} onChange={setDate} max={today} />
        <Text style={[styles.chosen, { color: t.text }]}>Data citirii: {formatDate(date)}</Text>

        {meters.map((m) => (
          <View key={m.id} style={[styles.meterBox, { borderColor: t.border }]}>
            <Field
              label={`${labelOf(m)} (m³ întregi)`}
              value={values[m.id] ?? ''}
              onChangeText={(v) => setValues((s) => ({ ...s, [m.id]: v }))}
              keyboardType="number-pad"
              placeholder="gol = nu adaug"
              large
            />
            <View style={styles.row}>
              <Button title="Din galerie" icon="image-outline" variant="secondary" onPress={() => choosePhoto(m, 'galerie')} style={{ flex: 1 }} />
              <Button title="Cameră" icon="camera-outline" variant="secondary" onPress={() => choosePhoto(m, 'camera')} style={{ flex: 1 }} />
              {photos[m.id] ? <Image source={{ uri: photos[m.id]! }} style={styles.thumb} /> : null}
            </View>
          </View>
        ))}

        <View style={[styles.row, styles.switchRow, { backgroundColor: tint(t.accent, 0.06) }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchTitle, { color: t.text }]}>Trimis deja</Text>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>Oprește dacă indexurile astea n-au fost trimise reprezentantului.</Text>
          </View>
          <Switch value={sent} onValueChange={setSent} trackColor={{ true: t.accent }} thumbColor={sent ? t.onAccent : undefined} />
        </View>
        <Button title="Salvează citirile" icon="content-save-outline" onPress={onSave} loading={busy} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chosen: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  meterBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 48, height: 48, borderRadius: 10 },
  switchRow: { padding: 12, borderRadius: 14, gap: 12 },
  switchTitle: { fontSize: 15, fontWeight: '700' },
});
