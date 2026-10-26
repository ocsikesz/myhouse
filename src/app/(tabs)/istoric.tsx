import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Card, Screen, SectionTitle, Title } from '@/components/ui';
import { YearChart } from '@/components/YearChart';
import { listAssociationPayments, listMeters, listProviderInvoices, listProviderMonthly, listReadings } from '@/db/repo';
import type { Meter } from '@/db/types';
import { addMonths, currentMonth, formatLei, formatNumber, historyStart, todayIso } from '@/lib/format';
import { monthlyConsumption } from '@/lib/stats';
import { useTheme, type Theme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';
import { buildYearComparison } from '@/lib/yearStats';

function colorFor(m: Meter, t: Theme): string {
  return m.kind === 'apa' ? t.water : m.kind === 'gaz' ? t.gas : t.electricity;
}

export default function HistoryScreen() {
  const t = useTheme();
  const today = todayIso();
  const month = currentMonth();
  const year = Number(today.slice(0, 4));
  const from = historyStart(today);

  const { data } = useDbQuery(async (d) => {
    const meters = await listMeters(d);
    const series = await Promise.all(
      meters.map(async (m) => {
        // Furnizorii: consumul lunar raportat de ei; altfel din diferența dintre indexuri
        const provider = m.provider === 'deservcom' ? [] : await listProviderMonthly(d, m.id, from.slice(0, 7));
        const rows = provider.some((r) => r.consumption !== null)
          ? provider.map((r) => ({ month: r.month, value: r.consumption }))
          : monthlyConsumption(await listReadings(d, m.id, 120), month, 24);
        const invoices = m.provider === 'deservcom' ? [] : await listProviderInvoices(d, m.id, `${year}-01-01`);
        const cost = invoices
          .filter((i) => (i.issue_date ?? i.due_date ?? '').startsWith(String(year)))
          .reduce((s, i) => s + i.amount, 0);
        return { meter: m, comparison: buildYearComparison(rows, today), cost };
      }),
    );

    // Apa: totalul celor două contoare
    const water = series.filter((s) => s.meter.kind === 'apa');
    const waterTotal =
      water.length > 1
        ? {
            ...water[0].comparison,
            points: water[0].comparison.points.map((p, i) => {
              const cur = water.map((w) => w.comparison.points[i].current);
              const prev = water.map((w) => w.comparison.points[i].previous);
              return {
                month: p.month,
                current: cur.every((v) => v !== null) ? cur.reduce((a, v) => a + (v ?? 0), 0) : null,
                previous: prev.every((v) => v !== null) ? prev.reduce((a, v) => a + (v ?? 0), 0) : null,
              };
            }),
          }
        : null;

    const payments = await listAssociationPayments(d, 24);
    const assocRows = Array.from({ length: 24 }, (_, i) => {
      const m = addMonths(month, i - 23);
      return { month: m, value: payments.find((p) => p.month === m)?.amount ?? null };
    });
    return {
      series: series.filter((s) => s.meter.kind !== 'apa'),
      waterTotal,
      waterMeters: water,
      assoc: buildYearComparison(assocRows, today),
      totalCost: series.reduce((s, x) => s + x.cost, 0) + assocRows.filter((r) => r.month.startsWith(String(year))).reduce((s, r) => s + (r.value ?? 0), 0),
    };
  });

  if (!data) return <Screen>{null}</Screen>;
  const cm = Number(month.slice(5, 7));

  return (
    <Screen>
      <Card>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>Cheltuieli casă în {year}, până acum</Text>
        <Text style={[styles.big, { color: t.text }]}>{formatLei(data.totalCost)}</Text>
        <Body muted>Facturi E.ON și Electrica plus consumul la asociație.</Body>
      </Card>

      {data.series.map(({ meter, comparison, cost }) => (
        <View key={meter.id} style={{ gap: 8 }}>
          <SectionTitle>{meter.name}</SectionTitle>
          <Card onPress={() => router.push(`/contor/${encodeURIComponent(meter.id)}`)}>
            <YearChart points={comparison.points} year={year} color={colorFor(meter, t)} unit={meter.unit} currentMonth={cm} />
            <Body muted>
              Total {year}: {formatNumber(comparison.totalCurrent, 0)} {meter.unit}
              {cost > 0 ? `, facturat ${formatLei(cost)}` : ''}
            </Body>
          </Card>
        </View>
      ))}

      {data.waterTotal ? (
        <View style={{ gap: 8 }}>
          <SectionTitle>Apă rece</SectionTitle>
          <Card onPress={() => router.push('/apa')}>
            <Title color={t.water}>Bucătărie și baie</Title>
            <YearChart points={data.waterTotal.points} year={year} color={t.water} unit="m³" decimals={2} currentMonth={cm} />
          </Card>
        </View>
      ) : null}

      <SectionTitle>Asociația</SectionTitle>
      <Card onPress={() => router.push('/asociatie')}>
        <YearChart points={data.assoc.points} year={year} color={t.accent} unit="lei" decimals={2} currentMonth={cm} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
