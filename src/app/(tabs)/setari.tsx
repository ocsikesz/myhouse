import Constants from 'expo-constants';

import { Body, Card, Screen, SectionTitle, Title } from '@/components/ui';
import { DB_NAME, SCHEMA_VERSION } from '@/db/migrations';

export default function SettingsScreen() {
  return (
    <Screen>
      <SectionTitle>Conturi furnizori</SectionTitle>
      <Card>
        <Body muted>Login E.ON și Electrica — pașii 4 și 5.</Body>
      </Card>

      <SectionTitle>Despre</SectionTitle>
      <Card>
        <Title>CasaMea</Title>
        <Body muted>Versiune {Constants.expoConfig?.version ?? '?'}</Body>
        <Body muted>
          Bază de date: {DB_NAME} · schema v{SCHEMA_VERSION}
        </Body>
      </Card>
    </Screen>
  );
}
