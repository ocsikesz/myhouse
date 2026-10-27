import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { Body, Button, Card, CardHeader, Chevron, Field, Screen, SectionTitle, Title } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { DB_NAME, SCHEMA_VERSION } from '@/db/migrations';
import { getSetting, setSetting } from '@/db/repo';
import { info } from '@/lib/dialogs';
import { useDbQuery } from '@/lib/useDbQuery';
import { formatDateTime } from '@/lib/format';
import { storedSession } from '@/cloud/client';
import { CLOUD } from '@/cloud/sync';
import { getCredentials } from '@/providers/credentials';
import { SETTINGS } from '@/lib/settingsKeys';
import { normalizeRoPhone } from '@/lib/whatsapp';

function WaterSettings() {
  const db = useSQLiteContext();
  const [phone, setPhone] = useState('');
  const [identification, setIdentification] = useState('');
  const [day, setDay] = useState('');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setPhone((await getSetting(db, SETTINGS.waterPhone)) ?? '');
      setIdentification((await getSetting(db, SETTINGS.waterIdentification)) ?? '');
      setDay((await getSetting(db, SETTINGS.waterReminderDay)) ?? '20');
      setDeadline((await getSetting(db, SETTINGS.waterDeadlineDay)) ?? '');
    })();
  }, [db]);

  async function onSave() {
    if (phone.trim() && !normalizeRoPhone(phone)) {
      info('Număr invalid', 'Exemplu valid: 0744 123 456');
      return;
    }
    const d = Number(day);
    if (!Number.isInteger(d) || d < 1 || d > 28) {
      info('Zi invalidă', 'Ziua reminder-ului trebuie să fie între 1 și 28.');
      return;
    }
    const dl = deadline.trim() ? Number(deadline) : null;
    if (dl !== null && (!Number.isInteger(dl) || dl < 1 || dl > 31)) {
      info('Termen invalid', 'Termenul trebuie să fie o zi între 1 și 31, sau gol dacă nu ai termen.');
      return;
    }
    setSaving(true);
    await setSetting(db, SETTINGS.waterDeadlineDay, dl === null ? '' : String(dl));
    await setSetting(db, SETTINGS.waterPhone, phone.trim());
    await setSetting(db, SETTINGS.waterIdentification, identification.trim());
    await setSetting(db, SETTINGS.waterReminderDay, String(d));
    setSaving(false);
    info('Salvat', 'Setările pentru apă au fost salvate.');
  }

  const t = useTheme();
  return (
    <Card>
      <CardHeader icon="whatsapp" color={t.whatsapp} title="Apă rece (WhatsApp)" subtitle="Unde și cum pleacă indexul la apă." />
      <Field
        label="Număr WhatsApp reprezentant"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="0744 123 456"
      />
      <Field
        label="Identificare în mesaj"
        value={identification}
        onChangeText={setIdentification}
        placeholder="ex: Str. Exemplu 10, ap. 5"
        autoCapitalize="sentences"
        hint="Apare la începutul mesajului, ca reprezentantul să știe de unde e indexul."
      />
      <Field
        label="Reminder începând cu ziua"
        value={day}
        onChangeText={setDay}
        keyboardType="number-pad"
        hint="Din ziua asta a lunii primești reminder zilnic până dai indexul la apă."
      />
      <Field
        label="Termen limită (ziua din lună)"
        value={deadline}
        onChangeText={setDeadline}
        keyboardType="number-pad"
        placeholder="ex: 25"
        hint="Până în ziua asta trebuie trimis indexul. În ultimele zile reminder-ul devine urgent și continuă zilnic până apare trimis."
      />
      <Button title="Salvează" icon="content-save-outline" onPress={onSave} loading={saving} />
    </Card>
  );
}

function AssociationSettings() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [day, setDay] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => setDay((await getSetting(db, SETTINGS.assocDueDay)) ?? ''))();
  }, [db]);

  async function onSave() {
    const d = day.trim() ? Number(day) : null;
    if (d !== null && (!Number.isInteger(d) || d < 1 || d > 31)) {
      info('Zi invalidă', 'Scadența trebuie să fie o zi între 1 și 31, sau gol.');
      return;
    }
    setSaving(true);
    await setSetting(db, SETTINGS.assocDueDay, d === null ? '' : String(d));
    setSaving(false);
    info('Salvat', 'Scadența implicită pentru asociație a fost salvată.');
  }

  return (
    <Card>
      <CardHeader icon="office-building-outline" color={t.association} title="Asociația (consum)" subtitle="Termenul de plată din fiecare lună." />
      <Field
        label="Scadență implicită (ziua din lună)"
        value={day}
        onChangeText={setDay}
        keyboardType="number-pad"
        placeholder="ex: 25"
        hint="Se folosește la fiecare lună care nu are scadență proprie. Cu 3 zile înainte primești reminder zilnic până marchezi plătit."
      />
      <Button title="Salvează" icon="content-save-outline" onPress={onSave} loading={saving} />
    </Card>
  );
}

function Accounts() {
  const t = useTheme();
  const { data } = useDbQuery(async () => ({
    eon: await getCredentials('eon'),
    electrica: await getCredentials('electrica'),
  }));
  const rows = [
    { id: 'eon', title: 'E.ON Myline', creds: data?.eon },
    { id: 'electrica', title: 'MyElectrica', creds: data?.electrica },
  ] as const;
  return (
    <>
      {rows.map((r) => (
        <Card key={r.id} onPress={() => router.push(`/cont/${r.id}`)}>
          <CardHeader
            icon={r.id === 'eon' ? 'fire' : 'lightning-bolt-outline'}
            color={r.id === 'eon' ? t.gas : t.electricity}
            title={r.title}
            subtitle={r.creds ? `Conectat: ${r.creds.email}` : 'Neconectat · atinge ca să te conectezi'}
            right={<Chevron />}
          />
        </Card>
      ))}
    </>
  );
}

/** Ce a răspuns API-ul E.ON la facturi — util când ceva lipsește. */
function Diagnostics() {
  const { data } = useDbQuery((d) =>
    d.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'debug.%' ORDER BY key"),
  );
  if (!data || data.length === 0) return null;
  return (
    <Card>
      <Title>Diagnostic furnizori</Title>
      {data.map((r) => (
        <Body key={r.key} muted>
          {r.key.replace('debug.', '')}: {r.value}
        </Body>
      ))}
    </Card>
  );
}

function FamilyCard() {
  const t = useTheme();
  const { data } = useDbQuery(async (d) => ({
    session: await storedSession(),
    lastSync: await getSetting(d, CLOUD.lastSync),
    error: await getSetting(d, CLOUD.error),
  }));
  const subtitle = data?.session
    ? data.error
      ? `Eroare: ${data.error}`
      : `${data.session.email} · ${data.lastSync ? `sincronizat ${formatDateTime(data.lastSync)}` : 'nesincronizat încă'}`
    : 'Folosiți aplicația toată familia, cu backup în cloud.';
  return (
    <Card onPress={() => router.push('/familie')}>
      <CardHeader
        icon={data?.session ? 'cloud-check-outline' : 'account-group-outline'}
        color={data?.session ? (data.error ? t.danger : t.success) : t.accent}
        title="Familie și backup"
        subtitle={subtitle}
        right={<Chevron />}
      />
    </Card>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  return (
    <Screen>
      <FamilyCard />

      <SectionTitle>Apă</SectionTitle>
      <WaterSettings />

      <SectionTitle>Asociație</SectionTitle>
      <AssociationSettings />

      <SectionTitle>Conturi furnizori</SectionTitle>
      <Accounts />

      <Diagnostics />

      <SectionTitle>Despre</SectionTitle>
      <Card>
        <CardHeader icon="home-heart" color={t.accent} title="CasaMea" />
        <Body muted>
          Versiune {Constants.expoConfig?.version ?? '?'} (build {Constants.expoConfig?.android?.versionCode ?? '?'})
        </Body>
        <Body muted>
          Bază de date: {DB_NAME} · schema v{SCHEMA_VERSION}
        </Body>
      </Card>
    </Screen>
  );
}
