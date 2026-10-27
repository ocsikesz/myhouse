import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { Badge, Icon, Sheet, SheetAction } from '@/components/ui';
import { deleteReading, setReadingPhoto } from '@/db/repo';
import type { Reading } from '@/db/types';
import { confirm } from '@/lib/dialogs';
import { formatDate } from '@/lib/format';
import { copyToGallery, deletePhoto, pickMeterPhoto, takeMeterPhoto } from '@/lib/photos';
import { useTheme } from '@/lib/theme';

/**
 * Detaliile unei citiri salvate: poza mare și acțiunile pe ea — adaugi sau
 * înlocuiești poza (din galerie sau cameră), o scoți, ori ștergi citirea.
 */
export function ReadingSheet({
  reading,
  label,
  valueText,
  photoPrefix,
  onClose,
  onChanged,
}: {
  reading: Reading | null;
  /** ex. „Baie” */
  label: string;
  /** Indexul gata formatat, cu unitate */
  valueText: string;
  photoPrefix: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTheme();
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  /** Poza afișată, actualizată imediat după schimbare */
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const current = photo !== undefined ? photo : (reading?.photo_uri ?? null);

  function close() {
    setPhoto(undefined);
    onClose();
  }

  async function replacePhoto(source: 'galerie' | 'camera') {
    if (!reading) return;
    setBusy(true);
    try {
      const uri = source === 'galerie' ? await pickMeterPhoto(photoPrefix) : await takeMeterPhoto(photoPrefix);
      if (!uri) return;
      await setReadingPhoto(db, reading.id, uri);
      await copyToGallery(db, uri, label, reading.read_at);
      if (current && current !== uri) deletePhoto(current);
      setPhoto(uri);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!reading || !current) return;
    const ok = await confirm('Scoți poza?', 'Citirea rămâne, doar poza se șterge.', 'Scoate poza');
    if (!ok) return;
    await setReadingPhoto(db, reading.id, null);
    deletePhoto(current);
    setPhoto(null);
    onChanged();
  }

  async function removeReading() {
    if (!reading) return;
    const ok = await confirm('Ștergi citirea?', `${label}: ${valueText} din ${formatDate(reading.read_at)}`, 'Șterge');
    if (!ok) return;
    await deleteReading(db, reading.id);
    deletePhoto(current);
    close();
    onChanged();
  }

  return (
    <Sheet visible={!!reading} onClose={close}>
      {reading && (
        <>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: t.textMuted }]}>
                {label} · {formatDate(reading.read_at)}
              </Text>
              <Text style={[styles.value, { color: t.text }]}>{valueText}</Text>
            </View>
            <Badge text={reading.sent_at ? 'trimis' : 'netrimis'} color={reading.sent_at ? t.success : t.textMuted} />
          </View>

          <View style={[styles.photo, { backgroundColor: t.surfaceAlt, borderColor: t.border }]}>
            {busy ? (
              <ActivityIndicator color={t.accent} />
            ) : current ? (
              <Image source={{ uri: current }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            ) : (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Icon name="image-off-outline" color={t.textMuted} size={32} />
                <Text style={{ color: t.textMuted }}>Fără poză</Text>
              </View>
            )}
          </View>

          <SheetAction
            icon="image-plus"
            label={current ? 'Înlocuiește cu o poză din galerie' : 'Adaugă poză din galerie'}
            onPress={() => replacePhoto('galerie')}
            disabled={busy}
          />
          <SheetAction
            icon="camera-outline"
            label={current ? 'Fă altă poză' : 'Fă o poză acum'}
            onPress={() => replacePhoto('camera')}
            disabled={busy}
          />
          {current ? (
            <SheetAction icon="image-remove" label="Scoate poza" onPress={removePhoto} color={t.warning} disabled={busy} />
          ) : null}
          <SheetAction icon="trash-can-outline" label="Șterge citirea" onPress={removeReading} color={t.danger} disabled={busy} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  photo: {
    height: 260,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
});
