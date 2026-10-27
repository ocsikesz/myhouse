import { router, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Body, Card, CardHeader, Chevron, Icon, IconBadge, Screen, SectionTitle, type IconName } from '@/components/ui';
import {
  getSetting,
  listAssociationPayments,
  listMeters,
  listProviderInvoices,
  listProviderMonthly,
  listProviderPayments,
  listProviderStatuses,
  listReadings,
  listUnpaidInvoices,
} from '@/db/repo';
import type { Meter } from '@/db/types';
import { addMonths, currentMonth, formatDate, formatDateTime, formatLei, formatMonth, formatNumber, todayIso } from '@/lib/format';
import { loadTasks } from '@/lib/loadTasks';
import { kindConsumption, monthCost, monthPaid, type ConsumptionRow, type KindConsumption } from '@/lib/monthSummary';
import { monthlyConsumption } from '@/lib/stats';
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

/** 'septembrie 2026' → 'septembrie' */
function monthName(month: string): string {
  return formatMonth(month).split(' ')[0];
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

/** Consumul lunar al unui contor: de la furnizor dacă îl raportează, altfel din diferența indexurilor. */
async function meterRows(d: Parameters<typeof listMeters>[0], m: Meter, month: string): Promise<ConsumptionRow[]> {
  if (m.provider !== 'deservcom') {
    const provider = await listProviderMonthly(d, m.id, addMonths(month, -4));
    if (provider.some((r) => r.consumption !== null)) return provider.map((r) => ({ month: r.month, consumption: r.consumption }));
  }
  // La apă lucrăm cu m³ întregi, ca în restul aplicației
  const readings = (await listReadings(d, m.id, 24)).map((r) =>
    m.kind === 'apa' ? { ...r, value: Math.trunc(r.value) } : r,
  );
  return monthlyConsumption(readings, month, 5).map((r) => ({ month: r.month, consumption: r.value }));
}

export default function HomeScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const [refreshing, setRefreshing] = useState(false);

  const { data, reload } = useDbQuery(async (d) => {
    const month = currentMonth();
    const meters = await listMeters(d);
    const ofKind = (k: Meter['kind']) => meters.filter((m) => m.kind === k);
    const consumption = async (k: Meter['kind']) =>
      kindConsumption(await Promise.all(ofKind(k).map((m) => meterRows(d, m, month))), month);

    const providerMeters = meters.filter((m) => m.provider !== 'deservcom');
    const invoices = (
      await Promise.all(
        providerMeters.map(async (m) =>
          (await listProviderInvoices(d, m.id, `${month}-01`)).map((i) => ({ ...i, provider: m.provider })),
        ),
      )
    ).flat();
    // Plățile din ultimele luni: ne spun dacă furnizorul raportează plăți
    const payments = (
      await Promise.all(
        providerMeters.map(async (m) =>
          (await listProviderPayments(d, m.id, `${addMonths(month, -3)}-01`)).map((p) => ({ ...p, provider: m.provider })),
        ),
      )
    ).flat();
    const payment = (await listAssociationPayments(d, 3)).find((p) => p.month === month) ?? null;
    const unpaidByMeter = (await listUnpaidInvoices(d)).reduce<Record<string, number>>((acc, i) => {
      acc[i.meter_id] = (acc[i.meter_id] ?? 0) + i.unpaid;
      return acc;
    }, {});

    const water = await Promise.all(ofKind('apa').map(async (m) => ({ meter: m, last: (await listReadings(d, m.id, 1))[0] ?? null })));

    return {
      tasks: await loadTasks(d),
      gas: await consumption('gaz'),
      electricity: await consumption('electricitate'),
      waterUse: await consumption('apa'),
      cost: monthCost(invoices, payment?.amount ?? null, month),
      paid: monthPaid(payments, invoices, payment, month),
      unpaidByMeter,
      water,
      providers: await listProviderStatuses(d),
      payment,
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
  const now = new Date();
  const { cost, payment } = data;

  /** Valoarea de consum + luna, dacă nu e luna curentă */
  const use = (c: KindConsumption, decimals = 0) => ({
    value: c.value !== null ? formatNumber(c.value, decimals) : '—',
    note: c.month && c.month !== month ? `în ${monthName(c.month)}` : null,
  });

  const gasMeters = data.providers.filter((p) => p.kind === 'gaz');
  const elMeters = data.providers.filter((p) => p.kind === 'electricitate');
  const goTo = (rows: typeof data.providers) =>
    rows.length === 1 ? router.push(`/contor/${encodeURIComponent(rows[0].meter_id)}`) : router.push(rows.length ? '/utilitati' : '/setari');
  const providerBadge = (rows: typeof data.providers) =>
    rows.some((r) => r.in_window && r.submitted_index === null) ? (
      <Badge text="index de trimis" color={t.danger} />
    ) : rows.some((r) => r.submitted_index !== null) ? (
      <Badge text="index trimis" color={t.success} />
    ) : null;

  const unpaidLine = (rows: typeof data.providers) => {
    if (rows.length === 0) return [];
    const sum = rows.reduce((s, r) => s + (data.unpaidByMeter[r.meter_id] ?? 0), 0);
    return [sum > 0.009 ? `De plată ${formatLei(sum)}` : 'Facturi achitate'];
  };

  const waterThisMonth = data.water.filter((w) => w.last?.read_at.startsWith(month));
  const waterBadge =
    waterThisMonth.length === 0 ? null : waterThisMonth.every((w) => w.last?.sent_at) ? (
      <Badge text="trimis" color={t.success} />
    ) : (
      <Badge text="netrimis" color={t.warning} />
    );

  const costParts = [
    cost.eon > 0 ? `E.ON ${formatLei(cost.eon)}` : null,
    cost.electrica > 0 ? `Electrica ${formatLei(cost.electrica)}` : null,
    cost.association > 0 ? `Asociație ${formatLei(cost.association)}` : null,
  ].filter(Boolean);

  const gas = use(data.gas);
  const el = use(data.electricity);
  const wat = use(data.waterUse);

  return (
    <Screen refreshing={refreshing} onRefresh={() => refresh(true)}>
      {/* Rezumatul lunii */}
      <View style={[styles.hero, { backgroundColor: t.hero }]}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroSmall, { color: t.heroMuted }]}>
              {ZILE[now.getDay()]}, {formatDate(todayIso())}
            </Text>
            <Text style={[styles.heroGreeting, { color: t.heroText }]}>{greeting()}</Text>
          </View>
          <View style={[styles.heroIcon, { backgroundColor: 'rgba(255,255,255,0.14)' }]}>
            <Icon name={data.tasks.length === 0 ? 'home-heart' : 'home-alert-outline'} color={t.heroText} size={28} />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={[styles.heroLabel, { color: t.heroMuted }]}>{formatMonth(month)}</Text>
          <View style={styles.money}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroSmall, { color: t.heroMuted }]}>De plătit (facturat)</Text>
              <Text style={[styles.heroTotal, { color: t.heroText }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatLei(cost.total)}
              </Text>
            </View>
            <View style={[styles.moneySep, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroSmall, { color: t.heroMuted }]}>Plătit</Text>
              <Text style={[styles.heroTotal, { color: t.heroText }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatLei(data.paid)}
              </Text>
            </View>
          </View>
          <Text style={[styles.heroSmall, { color: t.heroMuted }]}>
            {costParts.length ? costParts.join(' · ') : 'Nicio factură și nicio sumă la asociație luna asta, încă.'}
          </Text>
        </View>

        <Text style={[styles.heroLabel, { color: t.heroMuted, marginBottom: -8 }]}>Consumat</Text>
        <View style={styles.pills}>
          <Pill icon="fire" label="Gaz" value={gas.value} unit="m³" note={gas.note} />
          <Pill icon="water-outline" label="Apă" value={wat.value} unit="m³" note={wat.note} />
          <Pill icon="lightning-bolt-outline" label="Curent" value={el.value} unit="kWh" note={el.note} />
        </View>
      </View>

      {data.tasks.length > 0 && <SectionTitle>De făcut · {data.tasks.length}</SectionTitle>}
      {data.tasks.map((task) => {
        const look = taskLook(task, t);
        const isUrgent = task.urgency === 'urgent';
        return (
          <Card
            key={task.key}
            onPress={() => router.push(task.url as Href)}
            style={isUrgent ? { borderColor: t.danger, borderWidth: 1.5 } : undefined}
          >
            <CardHeader icon={look.icon} color={look.color} title={task.title} subtitle={task.body} right={<Chevron />} />
          </Card>
        );
      })}

      <SectionTitle>Casa</SectionTitle>
      <View style={styles.tiles}>
        <Tile
          icon="fire"
          color={t.gas}
          title="Gaz"
          value={gas.value}
          unit="m³"
          note={gas.note}
          onPress={() => goTo(gasMeters)}
          badge={providerBadge(gasMeters)}
          lines={
            gasMeters.length === 0
              ? ['Cont neconectat']
              : [...gasMeters.map((p) => `Index ${p.last_index !== null ? formatNumber(p.last_index, 0) : '—'}`), ...unpaidLine(gasMeters)]
          }
        />
        <Tile
          icon="lightning-bolt-outline"
          color={t.electricity}
          title="Curent"
          value={el.value}
          unit="kWh"
          note={el.note}
          onPress={() => goTo(elMeters)}
          badge={providerBadge(elMeters)}
          lines={
            elMeters.length === 0
              ? ['Cont neconectat']
              : [...elMeters.map((p) => `Index ${p.last_index !== null ? formatNumber(p.last_index, 0) : '—'}`), ...unpaidLine(elMeters)]
          }
        />
      </View>
      <View style={styles.tiles}>
        <Tile
          icon="water-outline"
          color={t.water}
          title="Apă rece"
          value={wat.value}
          unit="m³"
          note={wat.note}
          onPress={() => router.push('/apa')}
          badge={waterBadge}
          lines={data.water.map(
            ({ meter, last }) =>
              `${meter.name.split('–').pop()?.trim()} ${last ? formatNumber(Math.trunc(last.value), 0) : '—'}`,
          )}
        />
        <Tile
          icon="office-building-outline"
          color={t.association}
          title="Asociația"
          value={payment ? formatNumber(payment.amount, 2) : '—'}
          unit="lei"
          onPress={() => router.push('/asociatie')}
          badge={payment ? <Badge text={payment.paid_at ? 'plătit' : 'de plată'} color={payment.paid_at ? t.success : t.danger} /> : null}
          lines={[payment ? (payment.due_date ? `Scadent ${formatDate(payment.due_date)}` : monthName(month)) : 'Sumă neintrodusă']}
        />
      </View>

      {!data.hasAccounts && (
        <Card onPress={() => router.push('/setari')}>
          <CardHeader
            icon="link-variant"
            color={t.accent}
            title="Conectează E.ON și Electrica"
            subtitle="Ca să vezi consumul și facturile și să trimiți indexul din aplicație."
            right={<Chevron />}
          />
        </Card>
      )}
      {data.lastSync ? <Body muted>Actualizat {formatDateTime(data.lastSync)} · trage în jos ca să actualizezi</Body> : null}
    </Screen>
  );
}

/** Consumul unei utilități în cardul de sus. */
function Pill({ icon, label, value, unit, note }: { icon: IconName; label: string; value: string; unit: string; note: string | null }) {
  const t = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
      <View style={styles.pillHead}>
        <Icon name={icon} color={t.heroMuted} size={15} />
        <Text style={[styles.pillLabel, { color: t.heroMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.pillValue, { color: t.heroText }]} numberOfLines={1} adjustsFontSizeToFit>
        {value} <Text style={styles.pillUnit}>{unit}</Text>
      </Text>
      {note ? <Text style={[styles.pillNote, { color: t.heroMuted }]}>{note}</Text> : null}
    </View>
  );
}

/** Dala unei utilități: consumul lunii mare, apoi indexuri / detalii și starea. */
function Tile({
  icon,
  color,
  title,
  value,
  unit,
  note,
  lines,
  badge,
  onPress,
}: {
  icon: IconName;
  color: string;
  title: string;
  value: string;
  unit: string;
  note?: string | null;
  lines: string[];
  badge: ReactNode;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Card onPress={onPress} style={styles.tile}>
      <View style={styles.tileHead}>
        <IconBadge name={icon} color={color} size={36} />
        <Text style={[styles.tileTitle, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={[styles.tileValue, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value} <Text style={[styles.tileUnit, { color: t.textMuted }]}>{unit}</Text>
      </Text>
      {note ? <Text style={[styles.tileLine, { color: t.textMuted }]}>consum {note}</Text> : null}
      {lines.map((l, i) => (
        <Text key={i} style={[styles.tileLine, { color: t.textMuted }]} numberOfLines={1}>
          {l}
        </Text>
      ))}
      <View style={{ flex: 1 }} />
      {badge}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, padding: 18, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroGreeting: { fontSize: 22, fontWeight: '800' },
  heroSmall: { fontSize: 13 },
  heroTotal: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'], marginVertical: 2 },
  heroLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  money: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  moneySep: { width: 1, alignSelf: 'stretch' },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, gap: 2 },
  pillHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  pillValue: { fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pillUnit: { fontSize: 12, fontWeight: '600' },
  pillNote: { fontSize: 11 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, gap: 4 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  tileTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  tileValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tileUnit: { fontSize: 13, fontWeight: '600' },
  tileLine: { fontSize: 13 },
});
