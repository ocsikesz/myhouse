import { Body, Card, Screen, SectionTitle, Title } from '@/components/ui';

const PROVIDERS = [
  { title: 'Apă rece', subtitle: 'Deservcom · introducere manuală, trimitere pe WhatsApp', step: 2 },
  { title: 'Asociația de proprietari', subtitle: 'Consumul lunar · plătit / neplătit', step: 3 },
  { title: 'E.ON', subtitle: 'Cont Myline · fereastră autocitire, trimitere index', step: 4 },
  { title: 'Electrica', subtitle: 'Cont MyElectrica · fereastră autocitire, trimitere index', step: 5 },
];

export default function UtilitiesScreen() {
  return (
    <Screen>
      <SectionTitle>Utilități</SectionTitle>
      {PROVIDERS.map((p) => (
        <Card key={p.title}>
          <Title>{p.title}</Title>
          <Body muted>{p.subtitle}</Body>
          <Body muted>În lucru — pasul {p.step}</Body>
        </Card>
      ))}
    </Screen>
  );
}
