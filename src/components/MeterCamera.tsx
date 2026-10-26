import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import type { Rect } from '@/lib/meterOcr';
import { persistPhoto } from '@/lib/photos';
import { useTheme } from '@/lib/theme';

/**
 * Cadrul în fracții din previzualizare. Previzualizarea are exact raportul
 * pozei (3:4, fără decupare), deci aceleași fracții se aplică și pe poză.
 */
const FRAMES: Record<'ingust' | 'inalt', Rect> = {
  ingust: { left: 0.07, right: 0.93, top: 0.4, bottom: 0.6 },
  inalt: { left: 0.07, right: 0.93, top: 0.34, bottom: 0.66 },
};

const ZOOM_STEP = 0.1;
const ZOOM_MAX = 0.6;

/**
 * Cameră pe tot ecranul cu un dreptunghi în care încadrezi indexul (tamburii la
 * apă și gaz, afișajul la curent). Returnează poza întreagă + zona din cadru.
 */
export function MeterCamera({
  visible,
  prefix,
  onCancel,
  onCapture,
}: {
  visible: boolean;
  prefix: string;
  onCancel: () => void;
  onCapture: (photo: { uri: string; region: Rect }) => void;
}) {
  const t = useTheme();
  const { width: screenW } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [size, setSize] = useState<'ingust' | 'inalt'>('ingust');
  const [busy, setBusy] = useState(false);

  const camW = screenW;
  const camH = (screenW * 4) / 3;
  const frame = FRAMES[size];
  const box = {
    left: frame.left * camW,
    top: frame.top * camH,
    width: (frame.right - frame.left) * camW,
    height: (frame.bottom - frame.top) * camH,
  };

  async function shoot() {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.85, shutterSound: false });
      if (!pic?.uri) return;
      const uri = await persistPhoto(pic.uri, prefix);
      onCapture({ uri, region: frame });
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setTorch(false);
    onCancel();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <SafeAreaView style={styles.root}>
        {!permission ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.hint}>Pentru a fotografia contorul, aplicația are nevoie de acces la cameră.</Text>
            <Button title="Permite camera" onPress={requestPermission} />
            <Button title="Renunță" variant="secondary" onPress={close} />
          </View>
        ) : (
          <>
            <Text style={styles.hint}>Încadrează doar cifrele indexului în dreptunghi — la apă și gaz și cifrele roșii.</Text>
            <View style={{ width: camW, height: camH }}>
              {visible ? (
                <CameraView
                  ref={camera}
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  ratio="4:3"
                  zoom={zoom}
                  enableTorch={torch}
                  onCameraReady={() => setReady(true)}
                />
              ) : null}
              {/* Umbră în afara cadrului */}
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={[styles.shade, { top: 0, left: 0, right: 0, height: box.top }]} />
                <View style={[styles.shade, { top: box.top + box.height, left: 0, right: 0, bottom: 0 }]} />
                <View style={[styles.shade, { top: box.top, left: 0, width: box.left, height: box.height }]} />
                <View style={[styles.shade, { top: box.top, left: box.left + box.width, right: 0, height: box.height }]} />
                <View style={[styles.frame, { borderColor: t.accent }, box]} />
              </View>
            </View>
            <View style={styles.controls}>
              <Toggle label={torch ? 'Lanternă: pornită' : 'Lanternă'} active={torch} onPress={() => setTorch((v) => !v)} />
              <Toggle
                label={size === 'ingust' ? 'Cadru: îngust' : 'Cadru: înalt'}
                active={size === 'inalt'}
                onPress={() => setSize((s) => (s === 'ingust' ? 'inalt' : 'ingust'))}
              />
              <Toggle label="−" active={false} onPress={() => setZoom((z) => Math.max(0, +(z - ZOOM_STEP).toFixed(2)))} />
              <Toggle label="+" active={false} onPress={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))} />
            </View>
            <View style={styles.actions}>
              <Button title="Renunță" variant="secondary" onPress={close} style={{ flex: 1 }} />
              <Button title="Fotografiază" onPress={shoot} loading={busy} disabled={!ready} style={{ flex: 2 }} />
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function Toggle({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.toggle, active && styles.toggleActive]}
    >
      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', justifyContent: 'center', gap: 12 },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  hint: { color: '#fff', fontSize: 15, textAlign: 'center', paddingHorizontal: 16 },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  frame: { position: 'absolute', borderWidth: 3, borderRadius: 8 },
  controls: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  toggle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 44, alignItems: 'center' },
  toggleActive: { backgroundColor: '#fff' },
  toggleText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  toggleTextActive: { color: '#000' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
});
