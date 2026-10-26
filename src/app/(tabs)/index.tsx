import { Body, Card, Screen, SectionTitle, Title } from '@/components/ui';
import { latestReading, listAssociationPayments, listMeters } from '@/db/repo';
import { currentMonth, formatDate, formatLei, formatMonth, formatNumber } from '@/lib/format';
import { useDbQuery } from '@/lib/useDbQuery';

export default function HomeScreen() {
  const { data } = useDbQuery(async (db) => {
    const meters = await listMeters(db);
    const latest = await Promise.all(meters.map((m) => latestReading(db, m.id)));
    const payments = await listAssociationPayments(db, 1);
    return { meters, latest, lastPayment: payments[0] ?? null };
  });

  if (!data) return <Screen>{null}</Screen>;

  const month = currentMonth();
  const assoc = data.lastPayment?.month === month ? data.lastPayment : null;

  return (
    <Screen>
      <SectionTitle>De făcut luna aceasta</SectionTitle>
      <Card>
        <Body muted>
          Aici vor apărea reminder-ele: indexuri de transmis la E.ON, Electrica și apă, plus plata
          către asociație.
        </Body>
      </Card>

      <SectionTitle>Contoare</SectionTitle>
      {data.meters.map((m, i) => {
        const r = data.latest[i];
        return (
          <Card key={m.id}>
            <Title>{m.name}</Title>
            <Body muted>
              {r
                ? `Ultimul index: ${formatNumber(r.value, 3)} ${m.unit} · ${formatDate(r.read_at)}`
                : 'Nicio citire încă'}
            </Body>
          </Card>
        );
      })}

      <SectionTitle>Asociația de proprietari</SectionTitle>
      <Card>
        <Title>{formatMonth(month)}</Title>
        <Body muted>
          {assoc
            ? `${formatLei(assoc.amount)} · ${assoc.paid_at ? 'plătit' : 'neplătit'}`
            : 'Suma pentru luna aceasta nu a fost introdusă'}
        </Body>
      </Card>
    </Screen>
  );
}
