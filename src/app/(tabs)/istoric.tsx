import { BarChart } from '@/components/BarChart';
import { Body, Card, Screen, SectionTitle, Title } from '@/components/ui';
import { listAssociationPayments, listMeters, listReadings } from '@/db/repo';
import type { Meter } from '@/db/types';
import { addMonths, currentMonth } from '@/lib/format';
import { monthlyConsumption } from '@/lib/stats';
import { useTheme, type Theme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';

function colorFor(m: Meter, t: Theme): string {
  return m.kind === 'apa' ? t.water : m.kind === 'gaz' ? t.gas : t.electricity;
}

export default function HistoryScreen() {
  const t = useTheme();
  const month = currentMonth();

  const { data } = useDbQuery(async (d) => {
    const meters = await listMeters(d);
    const series = await Promise.all(
      meters.map(async (m) => ({ meter: m, bars: monthlyConsumption(await listReadings(d, m.id, 60), month, 12) })),
    );
    // Apa: totalul celor două contoare, lună de lună
    const water = series.filter((s) => s.meter.kind === 'apa');
    const waterTotal =
      water.length > 1
        ? water[0].bars.map((b, i) => {
            const vals = water.map((w) => w.bars[i].value);
            return { month: b.month, value: vals.every((v) => v !== null) ? vals.reduce((a, v) => a + (v ?? 0), 0) : null };
          })
        : null;
    const payments = await listAssociationPayments(d, 12);
    const assocBars = Array.from({ length: 12 }, (_, i) => {
      const m = addMonths(month, i - 11);
      return { month: m, value: payments.find((p) => p.month === m)?.amount ?? null };
    });
    return { series, waterTotal, assocBars };
  });

  if (!data) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <SectionTitle>Consum lunar · ultimele 12 luni</SectionTitle>
      {data.waterTotal && (
        <Card>
          <Title color={t.water}>Apă rece – total</Title>
          <BarChart bars={data.waterTotal} color={t.water} unit="m³" decimals={2} />
        </Card>
      )}
      {data.series.map(({ meter, bars }) => (
        <Card key={meter.id}>
          <Title color={colorFor(meter, t)}>{meter.name}</Title>
          <BarChart bars={bars} color={colorFor(meter, t)} unit={meter.unit} decimals={meter.kind === 'apa' ? 2 : 0} />
        </Card>
      ))}

      <SectionTitle>Asociația</SectionTitle>
      <Card>
        <Title color={t.accent}>Consum lunar (lei)</Title>
        <BarChart bars={data.assocBars} color={t.accent} unit="lei" decimals={2} />
      </Card>
      <Body muted>
        Consumul se calculează din diferența dintre indexuri și apare în luna citirii mai noi. Pentru E.ON și Electrica se
        folosesc indexurile facturate și cele trimise din aplicație.
      </Body>
    </Screen>
  );
}
