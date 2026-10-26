import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Badge, Body, Button, Card, Divider, Field, Row, Screen, SectionTitle, Title } from '@/components/ui';
import { addReading, deleteReading, getSetting, listMeters, listReadings, markReadingSent, setSetting } from '@/db/repo';
import type { Meter, Reading } from '@/db/types';
import { checkNewReading, withConsumption } from '@/lib/consumption';
import { confirm, info } from '@/lib/dialogs';
import { currentMonth, formatDate, formatNumber, parseDecimal, todayIso } from '@/lib/format';
import { deletePhoto, takeMeterPhoto } from '@/lib/photos';
import { SETTINGS } from '@/lib/settingsKeys';
import { useTheme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';
import { openWhatsApp } from '@/lib/openWhatsApp';
import { buildWaterMessage, normalizeRoPhone } from '@/lib/whatsapp';

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

export default function WaterScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  /** Citirile salvate acum, gata de trimis pe WhatsApp */
  const [justSaved, setJustSaved] = useState<Reading[] | null>(null);

  const { data, reload } = useDbQuery<WaterData>(async (d) => {
    const meters = (await listMeters(d)).filter((m) => m.kind === 'apa');
    const history: Record<string, Reading[]> = {};
    for (const m of meters) history[m.id] = await listReadings(d, m.id, 12);
    return {
      meters,
      history,
      phone: await getSetting(d, SETTINGS.waterPhone),
      identification: (await getSetting(d, SETTINGS.waterIdentification)) ?? '',
    };
  });

  if (!data) return <Screen>{null}</Screen>;

  async function onPhoto(meter: Meter) {
    const uri = await takeMeterPhoto(meter.id);
    if (uri) {
      deletePhoto(photos[meter.id] ?? null);
      setPhotos((p) => ({ ...p, [meter.id]: uri }));
    }
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
      const check = checkNewReading(value, data.history[m.id] ?? []);
      if (!check.ok && check.reason === 'mai_mic') {
        info(
          'Index mai mic decât precedentul',
          `${shortLabel(m)}: ${formatNumber(value, 3)} < ${formatNumber(check.previous, 3)} ${m.unit}. Verifică cifrele.`,
        );
        return;
      }
      if (!check.ok && check.reason === 'salt_mare') {
        const ok = await confirm(
          'Consum neobișnuit de mare',
          `${shortLabel(m)}: +${formatNumber(check.delta, 3)} ${m.unit}, față de o medie de ${formatNumber(check.typical, 3)} ${m.unit}. Salvezi totuși?`,
          'Salvează',
        );
        if (!ok) return;
      }
      toSave.push({ meter: m, value });
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
          });
        }
      });
      setValues({});
      setPhotos({});
      setJustSaved(saved);
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
      return { label: shortLabel(m), value: r.value, unit: m.unit };
    });
    const message = buildWaterMessage(data.identification, readings[0].read_at, lines);
    const opened = await openWhatsApp(phone, message);
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

  async function onDelete(r: Reading, m: Meter) {
    const ok = await confirm(
      'Ștergi citirea?',
      `${shortLabel(m)}: ${formatNumber(r.value, 3)} ${m.unit} din ${formatDate(r.read_at)}`,
      'Șterge',
    );
    if (!ok) return;
    await deleteReading(db, r.id);
    deletePhoto(r.photo_uri);
    reload();
  }

  // Ultimele citiri netrimise din luna curentă — pot fi retrimise oricând
  const month = currentMonth();
  const unsent = data.meters
    .map((m) => data.history[m.id]?.[0])
    .filter((r): r is Reading => !!r && !r.sent_at && r.read_at.startsWith(month));
  const pending = justSaved ?? (unsent.length > 0 ? unsent : null);

  return (
    <>
      <Stack.Screen options={{ title: 'Apă rece' }} />
      <Screen>
        <SectionTitle>Index nou · {formatDate(todayIso())}</SectionTitle>
        <Card>
          {data.meters.map((m, i) => {
            const last = data.history[m.id]?.[0];
            return (
              <View key={m.id} style={{ gap: 8 }}>
                {i > 0 && <Divider />}
                <Field
                  label={shortLabel(m)}
                  value={values[m.id] ?? ''}
                  onChangeText={(v) => setValues((s) => ({ ...s, [m.id]: v }))}
                  keyboardType="decimal-pad"
                  placeholder={last ? formatNumber(last.value, 3) : '0,000'}
                  hint={last ? `Ultimul: ${formatNumber(last.value, 3)} ${m.unit} (${formatDate(last.read_at)})` : 'Prima citire'}
                />
                <Row>
                  <Button title={photos[m.id] ? 'Refă poza' : 'Poză contor'} variant="secondary" onPress={() => onPhoto(m)} style={{ flex: 1 }} />
                  {photos[m.id] ? <Image source={{ uri: photos[m.id]! }} style={styles.thumb} /> : null}
                </Row>
              </View>
            );
          })}
          <Button title="Salvează" onPress={onSave} loading={saving} />
        </Card>

        {pending && (
          <Card style={{ borderColor: '#25D366' }}>
            <Title>Gata de trimis</Title>
            {pending.map((r) => {
              const m = data.meters.find((x) => x.id === r.meter_id);
              return m ? (
                <Body key={r.id}>
                  {shortLabel(m)}: {formatNumber(r.value, 3)} {m.unit}
                </Body>
              ) : null;
            })}
            <Button title="Trimite pe WhatsApp" variant="whatsapp" onPress={() => onSendWhatsApp(pending)} />
          </Card>
        )}

        {data.meters.map((m) => {
          const points = withConsumption(data.history[m.id] ?? []);
          return (
            <View key={m.id} style={{ gap: 8 }}>
              <SectionTitle>Istoric · {shortLabel(m)}</SectionTitle>
              <Card>
                {points.length === 0 && <Body muted>Nicio citire încă.</Body>}
                {points.map(({ reading: r, delta }, i) => (
                  <Pressable key={r.id} onLongPress={() => onDelete(r, m)}>
                    {i > 0 && <Divider />}
                    <Row style={{ justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Body>
                          {formatNumber(r.value, 3)} {m.unit}
                        </Body>
                        <Body muted>
                          {formatDate(r.read_at)}
                          {delta !== null ? ` · consum ${formatNumber(delta, 3)} ${m.unit}` : ''}
                        </Body>
                      </View>
                      {r.photo_uri ? <Image source={{ uri: r.photo_uri }} style={styles.thumbSmall} /> : null}
                      <Badge text={r.sent_at ? 'trimis' : 'netrimis'} color={r.sent_at ? t.success : t.textMuted} />
                    </Row>
                  </Pressable>
                ))}
                {points.length > 0 && <Body muted>Ține apăsat pe o citire ca s-o ștergi.</Body>}
              </Card>
            </View>
          );
        })}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 46, height: 46, borderRadius: 8 },
  thumbSmall: { width: 36, height: 36, borderRadius: 6 },
});
