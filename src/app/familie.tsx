import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Body, Button, Card, CardHeader, Field, Screen, SectionTitle } from '@/components/ui';
import { cloudConfig, signIn, signOut, storedSession, saveFamilyKey, CloudError } from '@/cloud/client';
import { deriveFamilyKey } from '@/cloud/crypto';
import { CLOUD, cloudSync, queueEverything, resetCloudState } from '@/cloud/sync';
import { getSetting, setSetting } from '@/db/repo';
import { confirm, info } from '@/lib/dialogs';
import { formatDateTime } from '@/lib/format';
import { DEVICE } from '@/lib/settingsKeys';
import { useTheme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';

export default function FamilyScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const config = cloudConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'login' | 'sync' | null>(null);

  const { data, reload } = useDbQuery(async (d) => ({
    session: await storedSession(),
    lastSync: await getSetting(d, CLOUD.lastSync),
    error: await getSetting(d, CLOUD.error),
    pending: (await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox'))?.n ?? 0,
    notifications: (await getSetting(d, DEVICE.notifications)) !== '0',
    providerSync: (await getSetting(d, DEVICE.providerSync)) !== '0',
    saveToGallery: (await getSetting(d, DEVICE.saveToGallery)) !== '0',
  }));

  async function onConnect() {
    if (!email.trim() || !password) {
      info('Date lipsă', 'Completează emailul și parola contului familiei.');
      return;
    }
    setBusy('login');
    try {
      const s = await signIn(email.trim(), password);
      // Cheia care criptează parolele E.ON / Electrica — aceeași pe toate telefoanele familiei
      await saveFamilyKey(await deriveFamilyKey(password, s.userId));
      await resetCloudState(db);
      await queueEverything(db);
      const r = await cloudSync(db);
      setPassword('');
      if (r.ok === true) {
        info(
          'Telefon conectat',
          r.pulled > 0
            ? `Am adus ${r.pulled} ${r.pulled === 1 ? 'înregistrare' : 'înregistrări'} de la familie și am trimis ${r.pushed}.`
            : `Am salvat în cloud ${r.pushed} ${r.pushed === 1 ? 'înregistrare' : 'înregistrări'} de pe telefonul ăsta.`,
        );
      } else if (r.ok === false) {
        info('Conectat, dar sincronizarea a eșuat', r.message);
      }
    } catch (e) {
      info('Nu m-am putut conecta', e instanceof CloudError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      reload();
    }
  }

  async function onSyncNow() {
    setBusy('sync');
    const r = await cloudSync(db);
    setBusy(null);
    if (r.ok === false) info('Sincronizarea a eșuat', r.message);
    reload();
  }

  async function onDisconnect() {
    const ok = await confirm(
      'Deconectezi telefonul?',
      'Datele rămân pe telefon și în cloud. Telefonul nu se mai sincronizează cu familia până te conectezi din nou.',
      'Deconectează',
    );
    if (!ok) return;
    await signOut();
    await resetCloudState(db);
    reload();
  }

  async function toggle(key: string, on: boolean) {
    await setSetting(db, key, on ? '1' : '0');
    reload();
    // Comutatorul de furnizori oprit → aducem imediat datele E.ON / Electrica din cloud
    if (key === DEVICE.providerSync && !on && data?.session) {
      await cloudSync(db);
      reload();
    }
  }

  const session = data?.session ?? null;

  return (
    <Screen>
      {!config ? (
        <Card>
          <CardHeader icon="cloud-off-outline" color={t.warning} title="Sincronizarea nu e configurată" />
          <Body muted>
            Versiunea asta a aplicației a fost construită fără adresa serverului. Adaugă secretele SUPABASE_URL și
            SUPABASE_ANON_KEY în repo (GitHub → Settings → Secrets → Actions) și instalează APK-ul următor.
          </Body>
        </Card>
      ) : session ? (
        <Card>
          <CardHeader
            icon="cloud-check-outline"
            color={t.success}
            title="Conectat la contul familiei"
            subtitle={session.email}
          />
          <View style={styles.stats}>
            <Text style={[styles.meta, { color: t.textMuted }]}>
              Ultima sincronizare: {data?.lastSync ? formatDateTime(data.lastSync) : 'niciodată'}
            </Text>
            {data && data.pending > 0 ? (
              <Text style={[styles.meta, { color: t.warning }]}>
                {data.pending} {data.pending === 1 ? 'modificare' : 'modificări'} de trimis
              </Text>
            ) : null}
            {data?.error ? <Text style={[styles.meta, { color: t.danger }]}>{data.error}</Text> : null}
          </View>
          <Button title="Sincronizează acum" icon="cloud-sync-outline" onPress={onSyncNow} loading={busy === 'sync'} />
          <Button title="Deconectează telefonul" icon="logout" variant="dangerSoft" onPress={onDisconnect} />
        </Card>
      ) : (
        <Card>
          <CardHeader
            icon="account-group-outline"
            color={t.accent}
            title="Contul familiei"
            subtitle="Același email și aceeași parolă pe toate telefoanele."
          />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="familia@exemplu.ro" />
          <Field label="Parolă" value={password} onChangeText={setPassword} secureTextEntry />
          <Button title="Conectează telefonul" icon="cloud-upload-outline" onPress={onConnect} loading={busy === 'login'} />
          <Body muted>
            La prima conectare, tot ce e pe telefon (citiri, poze, asociație, setări, conturile furnizorilor) se salvează în
            cloud. Pe un telefon nou, datele familiei apar automat.
          </Body>
        </Card>
      )}

      <SectionTitle>Pe acest telefon</SectionTitle>
      <Card>
        <ToggleRow
          title="Notificări"
          hint="Reminder-e pentru autocitire, apă, facturi și asociație."
          value={data?.notifications ?? true}
          onChange={(v) => toggle(DEVICE.notifications, v)}
        />
        <View style={[styles.sep, { backgroundColor: t.border }]} />
        <ToggleRow
          title="Pozele în Galerie"
          hint="Pozele contoarelor salvate cu o citire se copiază și în Galerie, albumul Indexa."
          value={data?.saveToGallery ?? true}
          onChange={(v) => toggle(DEVICE.saveToGallery, v)}
        />
        <View style={[styles.sep, { backgroundColor: t.border }]} />
        <ToggleRow
          title="Se conectează la E.ON și Electrica"
          hint="Lasă pornit pe un singur telefon (al tău). Celelalte iau facturile, consumul și starea indexului din cloud, fără cod 2FA. Indexul îl pot trimite de pe orice telefon."
          value={data?.providerSync ?? true}
          onChange={(v) => toggle(DEVICE.providerSync, v)}
        />
      </Card>

      <SectionTitle>Cum adaugi familia</SectionTitle>
      <Card>
        <Body muted>1. Instalează același APK pe telefonul soției și al copilului.</Body>
        <Body muted>2. Setări → Familie și backup → conectează-te cu contul familiei.</Body>
        <Body muted>3. Pe telefoanele lor, „Se conectează la E.ON și Electrica” se oprește singur.</Body>
        <Body muted>Backup: tot ce introduceți e în cloud. Dacă schimbi telefonul, te conectezi și datele revin.</Body>
      </Card>
    </Screen>
  );
}

function ToggleRow({ title, hint, value, onChange }: { title: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.toggleTitle, { color: t.text }]}>{title}</Text>
        <Text style={[styles.meta, { color: t.textMuted }]}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent }} thumbColor={value ? t.onAccent : undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { gap: 2 },
  meta: { fontSize: 13, lineHeight: 18 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleTitle: { fontSize: 15, fontWeight: '700' },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
