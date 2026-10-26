import { router } from 'expo-router';

import { Body, Card, Screen, SectionTitle, Title } from '@/components/ui';
import { useTheme } from '@/lib/theme';

export default function UtilitiesScreen() {
  const t = useTheme();
  return (
    <Screen>
      <SectionTitle>Utilități</SectionTitle>
      <Card onPress={() => router.push('/apa')}>
        <Title color={t.water}>Apă rece</Title>
        <Body muted>Deservcom · bucătărie și baie · trimitere pe WhatsApp</Body>
      </Card>
      <Card onPress={() => router.push('/asociatie')}>
        <Title color={t.accent}>Asociația de proprietari</Title>
        <Body muted>Consumul lunar · plătit / neplătit · scadență</Body>
      </Card>
      <Card>
        <Title color={t.gas}>E.ON</Title>
        <Body muted>În lucru — pasul 4</Body>
      </Card>
      <Card>
        <Title color={t.electricity}>Electrica</Title>
        <Body muted>În lucru — pasul 5</Body>
      </Card>
    </Screen>
  );
}
