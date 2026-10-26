import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MeterDrum } from '@/components/MeterDrum';
import { Badge, Body, Card, CardHeader, Chevron, Icon, IconBadge, Screen, SectionTitle, type IconName } from '@/components/ui';
import { getSetting, latestReading, listAssociationPayments, listMeters, listProviderStatuses } from '@/db/repo';
import { currentMonth, formatDate, formatDateTime, formatLei, formatMonth, formatNumber, todayIso } from '@/lib/format';
import { loadTasks } from '@/lib/loadTasks';
import type { HomeTask } from '@/lib/tasks';
import { useTheme, type Theme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';
import { getCredentials } from '@/providers/credentials';
import { LAST_SYNC, syncAll } from '@/providers/sync';

/** Sincronizare automată la deschidere dacă datele sunt mai vechi de atât */
const STALE_MS = 3 * 60 * 60 * 1000;

const ZILE = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

function greeting(): string {
  const h = new Date().getHours();
  return h < 11 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';
}

/** Iconița și culoarea unei sarcini, după tipul ei (prefixul cheii). */
function taskLook(task: HomeTask, t: Theme): { icon: IconName; color: string } {
  const kind = task.key.split('.')[0];
  if (task.urgency === 'urgent' && kind !== 'water' && kind !== 'assoc') return { icon: 'alert-circle-outline', color: t.danger };
  switch (kind) {
    case 'auth':
      return { icon: 'account-alert-outline', color: t.danger };
    case 'index':
      return { icon: 'counter', color: t.electricity };
    case 'water':
      return { icon: 'water-outline', color: t.water };
    case 'invoice':
      return { icon: 'receipt-text-outline', color: t.warning };
    case 'assoc':
      return { icon: 'office-building-outline', color: t.association };
    default:
      return { icon: 'checkbox-blank-circle-outline', color: t.accent };
  }
}

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
  const now = new Date();
  const urgent = data.tasks.filter((x) => x.urgency === 'urgent').length;

  return (
    <Screen refreshing={refreshing} onRefresh={() => refresh(true)}>
      <View style={[styles.hero, { backgroundColor: t.hero }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.heroSmall, { color: t.heroMuted }]}>
            {ZILE[now.getDay()]}, {formatDate(todayIso())}
          </Text>
          <Text style={[styles.heroTitle, { color: t.heroText }]}>{greeting()}</Text>
          <Text style={[styles.heroSmall, { color: t.heroMuted }]}>
            {data.tasks.length === 0
              ? 'Totul e la zi în casă.'
              : `${data.tasks.length} ${data.tasks.length === 1 ? 'lucru' : 'lucruri'} de făcut${urgent ? `, ${urgent} urgent${urgent === 1 ? '' : 'e'}` : ''}`}
          </Text>
        </View>
        <View style={[styles.heroIcon, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
          <Icon name={data.tasks.length === 0 ? 'home-heart' : 'home-alert-outline'} color={t.heroText} size={34} />
        </View>
      </View>

      {data.tasks.length > 0 && <SectionTitle>De făcut</SectionTitle>}
      {data.tasks.map((task) => {
        const look = taskLook(task, t);
        const isUrgent = task.urgency === 'urgent';
        return (
          <Card
            key={task.key}
            onPress={() => router.push(task.url as Href)}
            style={isUrgent ? { borderColor: t.danger, borderWidth: 1.5 } : undefined}
          >
            <CardHeader
              icon={look.icon}
              color={look.color}
              title={task.title}
              subtitle={task.body}
              right={<Chevron />}
            />
          </Card>
        );
      })}

      <SectionTitle>Casa</SectionTitle>
      <View style={styles.tiles}>
        <Card onPress={() => router.push('/apa')} style={styles.tile}>
          <IconBadge name="water-outline" color={t.water} />
          <Text style={[styles.tileTitle, { color: t.text }]}>Apă rece</Text>
          {data.water.map(({ meter, last }) => (
            <Text key={meter.id} style={[styles.tileLine, { color: t.textMuted }]} numberOfLines={1}>
              {meter.name.split('–').pop()?.trim()}:{' '}
              <Text style={{ color: t.text, fontWeight: '700' }}>{last ? `${formatNumber(Math.trunc(last.value), 0)} ${meter.unit}` : '—'}</Text>
            </Text>
          ))}
          {data.water[0]?.last ? (
            <Text style={[styles.tileLine, { color: t.textMuted }]}>{formatDate(data.water[0].last.read_at)}</Text>
          ) : null}
        </Card>
        <Card onPress={() => router.push('/asociatie')} style={styles.tile}>
          <IconBadge name="office-building-outline" color={t.association} />
          <Text style={[styles.tileTitle, { color: t.text }]}>Asociația</Text>
          <Text style={[styles.tileLine, { color: t.textMuted, textTransform: 'capitalize' }]}>{formatMonth(month)}</Text>
          <Text style={[styles.tileAmount, { color: t.text }]}>{payment ? formatLei(payment.amount) : '—'}</Text>
          {payment ? (
            <Badge text={payment.paid_at ? 'plătit' : 'de plată'} color={payment.paid_at ? t.success : t.danger} />
          ) : (
            <Text style={[styles.tileLine, { color: t.textMuted }]}>sumă neintrodusă</Text>
          )}
        </Card>
      </View>

      {data.providers.length > 0 && (
        <>
          <SectionTitle>Energie și gaz</SectionTitle>
          {data.providers.map((p) => {
            const color = p.kind === 'gaz' ? t.gas : t.electricity;
            return (
              <Card key={p.meter_id} onPress={() => router.push(`/contor/${encodeURIComponent(p.meter_id)}`)}>
                <CardHeader
                  icon={p.kind === 'gaz' ? 'fire' : 'lightning-bolt-outline'}
                  color={color}
                  title={p.name}
                  subtitle={
                    p.window_start
                      ? `Autocitire ${formatDate(p.window_start)} – ${p.window_end ? formatDate(p.window_end) : '?'}`
                      : 'Autocitirea nu e anunțată încă'
                  }
                  right={
                    p.submitted_index !== null ? (
                      <Badge text="trimis" color={t.success} />
                    ) : p.in_window ? (
                      <Badge text="de trimis" color={t.danger} />
                    ) : (
                      <Chevron />
                    )
                  }
                />
                <MeterDrum value={p.last_index} unit={p.unit} size="small" />
              </Card>
            );
          })}
        </>
      )}

      {!data.hasAccounts && (
        <Card onPress={() => router.push('/setari')}>
          <CardHeader
            icon="link-variant"
            color={t.accent}
            title="Conectează E.ON și Electrica"
            subtitle="Ca să primești reminder-e de autocitire și să trimiți indexul din aplicație."
            right={<Chevron />}
          />
        </Card>
      )}
      {data.lastSync ? (
        <Body muted>
          Actualizat {formatDateTime(data.lastSync)} · trage în jos ca să actualizezi
        </Body>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: { fontSize: 28, fontWeight: '800' },
  heroSmall: { fontSize: 14 },
  heroIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, gap: 6 },
  tileTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  tileLine: { fontSize: 13 },
  tileAmount: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
