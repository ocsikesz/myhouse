import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { Body, Button, Card, Field, Screen, SectionTitle, Title } from '@/components/ui';
import { DB_NAME, SCHEMA_VERSION } from '@/db/migrations';
import { getSetting, setSetting } from '@/db/repo';
import { info } from '@/lib/dialogs';
import { SETTINGS } from '@/lib/settingsKeys';
import { normalizeRoPhone } from '@/lib/whatsapp';

function WaterSettings() {
  const db = useSQLiteContext();
  const [phone, setPhone] = useState('');
  const [identification, setIdentification] = useState('');
  const [day, setDay] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setPhone((await getSetting(db, SETTINGS.waterPhone)) ?? '');
      setIdentification((await getSetting(db, SETTINGS.waterIdentification)) ?? '');
      setDay((await getSetting(db, SETTINGS.waterReminderDay)) ?? '20');
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
    setSaving(true);
    await setSetting(db, SETTINGS.waterPhone, phone.trim());
    await setSetting(db, SETTINGS.waterIdentification, identification.trim());
    await setSetting(db, SETTINGS.waterReminderDay, String(d));
    setSaving(false);
    info('Salvat', 'Setările pentru apă au fost salvate.');
  }

  return (
    <Card>
      <Title>Apă rece (WhatsApp)</Title>
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
      <Button title="Salvează" onPress={onSave} loading={saving} />
    </Card>
  );
}

export default function SettingsScreen() {
  return (
    <Screen>
      <SectionTitle>Apă</SectionTitle>
      <WaterSettings />

      <SectionTitle>Conturi furnizori</SectionTitle>
      <Card>
        <Body muted>Login E.ON și Electrica — pașii 4 și 5.</Body>
      </Card>

      <SectionTitle>Despre</SectionTitle>
      <Card>
        <Title>CasaMea</Title>
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
