import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { combineImages, isNativeAvailable, isWhatsAppInstalled, shareToWhatsApp } from 'casamea-native';

import { MeterDrum } from '@/components/MeterDrum';
import { OldReadingSheet } from '@/components/OldReadingSheet';
import { ReadingSheet } from '@/components/ReadingSheet';
import { ScanButton } from '@/components/ScanButton';
import { Badge, Body, Button, Card, CardHeader, Field, Icon, Screen, SectionTitle, type IconName } from '@/components/ui';
import { addReading, getSetting, listMeters, listReadings, markReadingSent, setSetting } from '@/db/repo';
import type { Meter, Reading } from '@/db/types';
import { checkNewReading, withConsumption } from '@/lib/consumption';
import { confirm, info } from '@/lib/dialogs';
import { currentMonth, formatDate, formatNumber, parseDecimal, todayIso } from '@/lib/format';
import { copyToGallery, deletePhoto } from '@/lib/photos';
import { expectationFrom } from '@/lib/scanMeter';
import { SETTINGS } from '@/lib/settingsKeys';
import { useTheme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';
import { openWhatsApp } from '@/lib/openWhatsApp';
import { buildWaterMessage, normalizeRoPhone, wholeIndex } from '@/lib/whatsapp';

interface WaterData {
  meters: Meter[];
  history: Record<string, Reading[]>;
  phone: string | null;
  identification: string;
}

/** Eticheta scurtă din numele contorului: 'Apă rece – baie' → 'Baie' */
function shortLabel(m: Meter): string {
  const part = m.name.split('–').pop()?.trim() ?? m.name;
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function meterIcon(m: Meter): IconName {
  const n = m.name.toLowerCase();
  if (n.includes('bucăt') || n.includes('bucat')) return 'silverware-fork-knife';
  if (n.includes('baie')) return 'shower-head';
  return 'water-outline';
}

export default function WaterScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  /** Citirile salvate acum, gata de trimis pe WhatsApp */
  const [justSaved, setJustSaved] = useState<Reading[] | null>(null);
  /** Crește la fiecare salvare, ca să golească rezultatul scanării */
  const [saveCount, setSaveCount] = useState(0);
  /** Citirea deschisă în foaia de detalii */
  const [selected, setSelected] = useState<Reading | null>(null);
  /** Foaia „Adaugă o citire mai veche” */
  const [oldOpen, setOldOpen] = useState(false);

  const { data, reload } = useDbQuery<WaterData>(async (d) => {
    const meters = (await listMeters(d)).filter((m) => m.kind === 'apa');
    const history: Record<string, Reading[]> = {};
    // La apă lucrăm doar cu m³ întregi: cele 3 zecimale (tamburii roșii) nu contează
    for (const m of meters) {
      history[m.id] = (await listReadings(d, m.id, 12)).map((r) => ({ ...r, value: Math.trunc(r.value) }));
    }
    return {
      meters,
      history,
      phone: await getSetting(d, SETTINGS.waterPhone),
      identification: (await getSetting(d, SETTINGS.waterIdentification)) ?? '',
    };
  });

  if (!data) return <Screen>{null}</Screen>;

  function onPhoto(meter: Meter, uri: string) {
    deletePhoto(photos[meter.id] ?? null);
    setPhotos((p) => ({ ...p, [meter.id]: uri }));
  }

  async function onSave() {
    if (!data) return;
    const date = todayIso();
    const toSave: { meter: Meter; value: number }[] = [];

    for (const m of data.meters) {
      const raw = values[m.id]?.trim();
      if (!raw) continue;
      const value = parseDecimal(raw);
      if (value === null) {
        info('Index invalid', `„${raw}” nu este un număr valid pentru ${shortLabel(m)}.`);
        return;
      }
      const check = checkNewReading(Math.trunc(value), data.history[m.id] ?? []);
      if (!check.ok && check.reason === 'mai_mic') {
        info(
          'Index mai mic decât precedentul',
          `${shortLabel(m)}: ${wholeIndex(value)} < ${wholeIndex(check.previous)} ${m.unit}. Verifică cifrele.`,
        );
        return;
      }
      if (!check.ok && check.reason === 'salt_mare') {
        const ok = await confirm(
          'Consum neobișnuit de mare',
          `${shortLabel(m)}: +${wholeIndex(check.delta)} ${m.unit}, față de o medie de ${formatNumber(check.typical, 1)} ${m.unit}. Salvezi totuși?`,
          'Salvează',
        );
        if (!ok) return;
      }
      toSave.push({ meter: m, value: Math.trunc(value) });
    }

    if (toSave.length === 0) {
      info('Nimic de salvat', 'Introdu cel puțin un index.');
      return;
    }

    setSaving(true);
    try {
      const saved: Reading[] = [];
      await db.withTransactionAsync(async () => {
        for (const { meter, value } of toSave) {
          const id = await addReading(db, {
            meterId: meter.id,
            value,
            readAt: date,
            photoUri: photos[meter.id] ?? null,
          });
          saved.push({
            id,
            meter_id: meter.id,
            value,
            read_at: date,
            source: 'manual',
            photo_uri: photos[meter.id] ?? null,
            sent_at: null,
            note: null,
            uid: null,
          });
        }
      });
      // Copie în Galerie, albumul Indexa
      for (const { meter } of toSave) await copyToGallery(db, photos[meter.id] ?? null, shortLabel(meter), date);
      setValues({});
      setPhotos({});
      setJustSaved(saved);
      setSaveCount((c) => c + 1);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function onSendWhatsApp(readings: Reading[]) {
    if (!data) return;
    const phone = data.phone ? normalizeRoPhone(data.phone) : null;
    if (!phone) {
      const go = await confirm(
        'Lipsește numărul de WhatsApp',
        'Setează numărul reprezentantului firmei de apă în Setări.',
        'Deschide Setări',
      );
      if (go) router.push('/setari');
      return;
    }
    const lines = readings.map((r) => {
      const m = data.meters.find((x) => x.id === r.meter_id)!;
      // Citirea dinainte (luna trecută), din istoricul aceluiași contor
      const hist = data.history[m.id] ?? [];
      const idx = hist.findIndex((x) => x.id === r.id);
      const before = idx >= 0 ? hist[idx + 1] : hist.find((x) => x.read_at < r.read_at);
      return { label: shortLabel(m), value: r.value, previous: before ? before.value : null, unit: m.unit };
    });
    const message = buildWaterMessage(data.identification, readings[0].read_at, lines);
    // Cu poze: le atașăm direct în conversație; fără poze, linkul wa.me e suficient.
    // WhatsApp trimite fiecare poză ca mesaj separat, așa că mai multe poze le lipim
    // într-o singură imagine (cu eticheta fiecărui contor) → un singur mesaj.
    const withPhoto = readings.filter((r) => !!r.photo_uri);
    let photoUris = withPhoto.map((r) => r.photo_uri!);
    if (photoUris.length > 1 && isNativeAvailable()) {
      try {
        const labels = withPhoto.map((r) => {
          const m = data.meters.find((x) => x.id === r.meter_id)!;
          return `${shortLabel(m)}: ${wholeIndex(r.value)} ${m.unit}`;
        });
        const combined = await combineImages(photoUris, labels);
        if (combined) photoUris = [combined];
      } catch {
        // rămân pozele separate
      }
    }
    const opened =
      photoUris.length > 0 && isNativeAvailable() && isWhatsAppInstalled()
        ? shareToWhatsApp(phone, message, photoUris)
        : await openWhatsApp(phone, message);
    if (!opened) {
      info('WhatsApp nu a putut fi deschis', 'Verifică dacă WhatsApp este instalat.');
      return;
    }
    const sentAt = new Date().toISOString();
    for (const r of readings) await markReadingSent(db, r.id, sentAt);
    await setSetting(db, SETTINGS.waterSentMonth, readings[0].read_at.slice(0, 7));
    setJustSaved(null);
    reload();
  }

  // Ultimele citiri netrimise din luna curentă — pot fi retrimise oricând
  const month = currentMonth();
  const unsent = data.meters
    .map((m) => data.history[m.id]?.[0])
    .filter((r): r is Reading => !!r && !r.sent_at && r.read_at.startsWith(month));
  const pending = justSaved ?? (unsent.length > 0 ? unsent : null);
  const selectedMeter = selected ? data.meters.find((m) => m.id === selected.meter_id) : undefined;

  return (
    <>
      <Stack.Screen options={{ title: 'Apă rece' }} />
      <Screen>
        <SectionTitle>Index nou · {formatDate(todayIso())}</SectionTitle>
        {data.meters.map((m) => {
          const last = data.history[m.id]?.[0];
          return (
            <Card key={m.id}>
              <CardHeader
                icon={meterIcon(m)}
                color={t.water}
                title={shortLabel(m)}
                subtitle={last ? `Ultimul: ${wholeIndex(last.value)} ${m.unit} · ${formatDate(last.read_at)}` : 'Prima citire'}
              />
              <MeterDrum value={last ? last.value : null} unit={m.unit} size="small" />
              <Field
                label="Indexul de azi (m³ întregi)"
                value={values[m.id] ?? ''}
                onChangeText={(v) => setValues((s) => ({ ...s, [m.id]: v }))}
                keyboardType="number-pad"
                placeholder={last ? wholeIndex(last.value) : '0'}
                large
              />
              <ScanButton
                key={`${m.id}-${saveCount}`}
                prefix={m.id}
                expectation={expectationFrom(data.history[m.id] ?? [], 3)}
                decimals={0}
                unit={m.unit}
                onPhoto={(uri) => onPhoto(m, uri)}
                onValue={(v) => setValues((s) => ({ ...s, [m.id]: v }))}
              />
            </Card>
          );
        })}
        <Button title="Salvează indexurile" icon="content-save-outline" onPress={onSave} loading={saving} />

        {pending && (
          <Card style={{ borderColor: t.whatsapp, borderWidth: 1.5 }}>
            <CardHeader
              icon="whatsapp"
              color={t.whatsapp}
              title="Gata de trimis"
              subtitle={pending.some((r) => r.photo_uri) ? 'Pozele pleacă lipite într-o singură imagine, în același mesaj.' : 'Mesaj către reprezentantul firmei de apă.'}
            />
            <View style={styles.pendingRow}>
              {pending.map((r) => {
                const m = data.meters.find((x) => x.id === r.meter_id);
                return m ? (
                  <View key={r.id} style={[styles.pendingItem, { backgroundColor: t.surfaceAlt }]}>
                    {r.photo_uri ? (
                      <Image source={{ uri: r.photo_uri }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.noThumb, { borderColor: t.border }]}>
                        <Icon name="image-off-outline" color={t.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.meta, { color: t.textMuted }]}>{shortLabel(m)}</Text>
                      <Text style={[styles.value, { color: t.text }]}>
                        {wholeIndex(r.value)} {m.unit}
                      </Text>
                    </View>
                  </View>
                ) : null;
              })}
            </View>
            <Button title="Trimite pe WhatsApp" icon="send" variant="whatsapp" onPress={() => onSendWhatsApp(pending)} />
          </Card>
        )}

        {data.meters.map((m) => {
          const points = withConsumption(data.history[m.id] ?? []);
          return (
            <View key={m.id} style={{ gap: 8 }}>
              <SectionTitle>Istoric {shortLabel(m).toLowerCase()}</SectionTitle>
              <Card style={{ paddingVertical: 6 }}>
                {points.length === 0 && <Body muted>Nicio citire încă.</Body>}
                {points.map(({ reading: r, delta }, i) => (
                  <Pressable
                    key={r.id}
                    onPress={() => setSelected(r)}
                    style={({ pressed }) => [
                      styles.historyRow,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
                      pressed && { opacity: 0.6 },
                    ]}
                    accessibilityRole="button"
                    accessibilityHint="Deschide poza și opțiunile: înlocuiește poza, șterge citirea"
                  >
                    {r.photo_uri ? (
                      <Image source={{ uri: r.photo_uri }} style={styles.thumbSmall} />
                    ) : (
                      <View style={[styles.thumbSmall, styles.noThumb, { borderColor: t.border }]}>
                        <Icon name="image-plus" color={t.textMuted} size={18} />
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.value, { color: t.text }]}>
                        {wholeIndex(r.value)} {m.unit}
                      </Text>
                      <Text style={[styles.meta, { color: t.textMuted }]}>
                        {formatDate(r.read_at)}
                        {delta !== null ? ` · consum ${wholeIndex(delta)} ${m.unit}` : ''}
                      </Text>
                    </View>
                    <Badge text={r.sent_at ? 'trimis' : 'netrimis'} color={r.sent_at ? t.success : t.textMuted} />
                    <Icon name="dots-vertical" color={t.textMuted} />
                  </Pressable>
                ))}
              </Card>
              {points.length > 0 && <Text style={[styles.meta, styles.tip, { color: t.textMuted }]}>Atinge o citire ca să vezi poza, s-o schimbi sau s-o ștergi.</Text>}
            </View>
          );
        })}
        <Button
          title="Adaugă o citire mai veche"
          icon="history"
          variant="secondary"
          onPress={() => setOldOpen(true)}
        />
        <Text style={[styles.meta, styles.tip, { color: t.textMuted }]}>
          Pentru lunile trecute (din poze sau de pe hârtie). Cu istoric, aplicația citește mai sigur cifrele de pe contor.
        </Text>
      </Screen>

      <OldReadingSheet
        visible={oldOpen}
        meters={data.meters}
        labelOf={shortLabel}
        onClose={() => setOldOpen(false)}
        onSaved={() => {
          setJustSaved(null);
          reload();
        }}
      />

      <ReadingSheet
        reading={selected}
        label={selectedMeter ? shortLabel(selectedMeter) : ''}
        valueText={selected && selectedMeter ? `${wholeIndex(selected.value)} ${selectedMeter.unit}` : ''}
        photoPrefix={selected?.meter_id ?? 'apa'}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setJustSaved(null);
          reload();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 52, height: 52, borderRadius: 12 },
  thumbSmall: { width: 44, height: 44, borderRadius: 10 },
  noThumb: { borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  pendingRow: { gap: 8 },
  pendingItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  value: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 13 },
  tip: { paddingHorizontal: 4 },
});
