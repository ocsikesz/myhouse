import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Badge, Body, Card, Row, Screen, SectionTitle, Title } from '@/components/ui';
import { getSetting, latestReading, listAssociationPayments, listMeters, listProviderStatuses } from '@/db/repo';
import { currentMonth, formatDate, formatDateTime, formatLei, formatMonth, formatNumber } from '@/lib/format';
import { loadTasks } from '@/lib/loadTasks';
import { useTheme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';
import { getCredentials } from '@/providers/credentials';
import { LAST_SYNC, syncAll } from '@/providers/sync';

/** Sincronizare automată la deschidere dacă datele sunt mai vechi de atât */
const STALE_MS = 3 * 60 * 60 * 1000;

export default function HomeScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const [refreshing, setRefreshing] = useState(false);

  const { data, reload } = useDbQuery(async (d) => {
    const meters = await listMeters(d);
    const water = meters.filter((m) => m.kind === 'apa');
    return {
      tasks: await loadTasks(d),
      water: await Promise.all(water.map(async (m) => ({ meter: m, last: await latestReading(d, m.id) }))),
      providers: await listProviderStatuses(d),
      payment: (await listAssociationPayments(d, 1))[0] ?? null,
      lastSync: await getSetting(d, LAST_SYNC),
      hasAccounts: !!(await getCredentials('eon')) || !!(await getCredentials('electrica')),
    };
  });

  async function refresh(force = true) {
    setRefreshing(true);
    try {
      await syncAll(db, force);
    } finally {
      setRefreshing(false);
      reload();
    }
  }

  // La prima afișare: sincronizăm dacă datele sunt vechi
  const autoSynced = useRef(false);
  useEffect(() => {
    if (!data || autoSynced.current || !data.hasAccounts) return;
    autoSynced.current = true;
    const age = data.lastSync ? Date.now() - Date.parse(data.lastSync) : Infinity;
    if (age > STALE_MS) refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return <Screen>{null}</Screen>;

  const month = currentMonth();
  const payment = data.payment?.month === month ? data.payment : null;

  return (
    <Screen refreshing={refreshing} onRefresh={() => refresh(true)}>
      <SectionTitle>De făcut</SectionTitle>
      {data.tasks.length === 0 ? (
        <Card>
          <Body muted>Nimic de făcut acum. 🎉</Body>
        </Card>
      ) : (
        data.tasks.map((task) => (
          <Card
            key={task.key}
            onPress={() => router.push(task.url as Href)}
            style={task.urgency === 'urgent' ? { borderColor: t.danger, borderWidth: 1 } : undefined}
          >
            <Title color={task.urgency === 'urgent' ? t.danger : t.text}>{task.title}</Title>
            <Body muted>{task.body}</Body>
          </Card>
        ))
      )}

      {data.providers.length > 0 && (
        <>
          <SectionTitle>Energie și gaz</SectionTitle>
          <Card onPress={() => router.push('/utilitati')}>
            {data.providers.map((p) => (
              <Row key={p.meter_id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Body color={p.kind === 'gaz' ? t.gas : t.electricity}>{p.name}</Body>
                  <Body muted>
                    {p.last_index !== null ? `${formatNumber(p.last_index, 0)} ${p.unit}` : '—'}
                    {p.window_start ? ` · autocitire ${formatDate(p.window_start)}–${p.window_end ? formatDate(p.window_end) : '?'}` : ''}
                  </Body>
                </View>
                {p.submitted_index !== null ? (
                  <Badge text="trimis" color={t.success} />
                ) : p.in_window ? (
                  <Badge text="de trimis" color={t.danger} />
                ) : null}
              </Row>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>Apă rece</SectionTitle>
      <Card onPress={() => router.push('/apa')}>
        {data.water.map(({ meter, last }) => (
          <Body key={meter.id}>
            {meter.name.split('–').pop()?.trim()}:{' '}
            {last ? `${formatNumber(last.value, 3)} ${meter.unit} · ${formatDate(last.read_at)}` : 'nicio citire'}
          </Body>
        ))}
      </Card>

      <SectionTitle>Asociația</SectionTitle>
      <Card onPress={() => router.push('/asociatie')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Title>{formatMonth(month)}</Title>
          {payment ? (
            <Badge text={payment.paid_at ? 'plătit' : 'de plată'} color={payment.paid_at ? t.success : t.danger} />
          ) : null}
        </Row>
        <Body muted>{payment ? formatLei(payment.amount) : 'Suma nu a fost introdusă'}</Body>
      </Card>

      {!data.hasAccounts && (
        <Card onPress={() => router.push('/setari')}>
          <Body muted>Conectează conturile E.ON și Electrica în Setări ca să primești reminder-e de autocitire.</Body>
        </Card>
      )}
      {data.lastSync ? (
        <Body muted>
          Ultima actualizare: {formatDateTime(data.lastSync)} · trage în jos ca să actualizezi
        </Body>
      ) : null}
    </Screen>
  );
}
