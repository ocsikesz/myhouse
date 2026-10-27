import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { InvoiceList, PaymentList } from '@/components/InvoiceList';
import { MeterDrum } from '@/components/MeterDrum';
import { ScanButton } from '@/components/ScanButton';
import { Body, Button, Card, Field, Screen, SectionTitle } from '@/components/ui';
import { YearChart } from '@/components/YearChart';
import {
  getMeter,
  getProviderStatus,
  listProviderInvoices,
  listProviderMonthly,
  listProviderPayments,
  listReadings,
} from '@/db/repo';
import { checkNewReading } from '@/lib/consumption';
import { confirm, info } from '@/lib/dialogs';
import {
  daysBetween,
  formatDate,
  formatDateTime,
  formatLei,
  formatNumber,
  historyStart,
  parseDecimal,
  todayIso,
} from '@/lib/format';
import { expectationFrom } from '@/lib/scanMeter';
import { useTheme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';
import { billedInYear, buildYearComparison, invoiceIndexDelta, invoiceState } from '@/lib/yearStats';
import { submitProviderIndex, syncProvider, type AccountProvider } from '@/providers/sync';

export default function ProviderMeterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const t = useTheme();
  const [value, setValue] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState<'sync' | 'submit' | null>(null);
  const today = todayIso();
  const from = historyStart(today);

  const { data, reload } = useDbQuery(
    async (d) => ({
      meter: await getMeter(d, id),
      status: await getProviderStatus(d, id),
      history: await listReadings(d, id, 12),
      monthly: await listProviderMonthly(d, id, from.slice(0, 7)),
      invoices: await listProviderInvoices(d, id, from),
      payments: await listProviderPayments(d, id, from),
    }),
    [id],
  );

  if (!data?.meter) return <Screen>{null}</Screen>;
  const { meter, status, history, monthly, invoices, payments } = data;
  const provider = meter.provider as AccountProvider;
  const color = meter.kind === 'gaz' ? t.gas : t.electricity;
  const inWindow = !!status?.in_window;
  const submitted = status?.submitted_index !== null && status?.submitted_index !== undefined;
  const daysLeft = status?.window_end ? daysBetween(today, status.window_end) : null;
  const year = Number(today.slice(0, 4));

  const comparison = buildYearComparison(
    monthly.map((m) => ({ month: m.month, value: m.consumption })),
    today,
  );
  const thisYearInvoices = invoices.filter((i) => (i.issue_date ?? i.due_date ?? '').startsWith(String(year)) || !i.paid);
  const billed = billedInYear(invoices, payments, year);
  const unpaid = invoices.filter((i) => invoiceState(i, today) !== 'paid');
  const unpaidTotal = unpaid.reduce((s, i) => s + i.unpaid, 0);
  const overdue = unpaid.some((i) => invoiceState(i, today) === 'overdue');
  const paymentsThisYear = payments.filter((p) => p.paid_on.startsWith(String(year)));
  // Plățile le arătăm doar când lista de facturi nu le conține pe cele plătite
  const showPayments = paymentsThisYear.length > 0 && !invoices.some((i) => i.paid);

  async function onSync() {
    setBusy('sync');
    const r = await syncProvider(db, provider, true);
    setBusy(null);
    if (r.status === 'auth') {
      const go = await confirm('Reconectare necesară', r.message, 'Reconectează');
      if (go) router.push(`/cont/${provider}`);
    } else if (r.status === 'error') {
      info('Actualizarea a eșuat', r.message);
    }
    reload();
  }

  async function onSubmit() {
    const v = parseDecimal(value);
    if (v === null || !Number.isInteger(v)) {
      info('Index invalid', 'Introdu indexul ca număr întreg, fără zecimale (cifrele negre de pe contor).');
      return;
    }
    const check = checkNewReading(v, history);
    if (!check.ok && check.reason === 'mai_mic') {
      info('Index prea mic', `Ultimul index cunoscut este ${formatNumber(check.previous, 0)} ${meter!.unit}.`);
      return;
    }
    if (!check.ok && check.reason === 'salt_mare') {
      const go = await confirm(
        'Consum neobișnuit de mare',
        `+${formatNumber(check.delta, 0)} ${meter!.unit} față de o medie de ${formatNumber(check.typical, 0)}. Trimiți totuși?`,
        'Trimite',
      );
      if (!go) return;
    }
    const ok = await confirm('Trimiți indexul?', `${meter!.name}: ${formatNumber(v, 0)} ${meter!.unit}`, 'Trimite indexul');
    if (!ok) return;

    setBusy('submit');
    const r = await submitProviderIndex(db, meter!.id, v, photo);
    setBusy(null);
    if (r.ok) {
      setValue('');
      setPhoto(null);
      info('Index trimis', 'Furnizorul a primit indexul.');
      reload();
    } else {
      info('Indexul nu a fost trimis', r.message);
    }
  }

  const windowText = submitted
    ? `Index trimis: ${formatNumber(status!.submitted_index!, 0)} ${meter.unit}`
    : inWindow
      ? daysLeft !== null && daysLeft <= 0
        ? 'Azi e ultima zi de autocitire'
        : `Autocitire deschisă încă ${daysLeft} ${daysLeft === 1 ? 'zi' : 'zile'}`
      : status?.window_start
        ? `Următoarea autocitire: ${formatDate(status.window_start)} – ${status.window_end ? formatDate(status.window_end) : '?'}`
        : 'Perioada de autocitire nu e anunțată încă';
  const windowColor = submitted ? t.success : inWindow ? t.danger : t.textMuted;

  return (
    <>
      <Stack.Screen options={{ title: meter.name }} />
      <Screen refreshing={busy === 'sync'} onRefresh={onSync}>
        {/* Contorul */}
        <Card style={{ borderTopWidth: 4, borderTopColor: color }}>
          <Text style={[styles.caption, { color: t.textMuted }]}>Ultimul index facturat</Text>
          <MeterDrum value={status?.last_index ?? null} unit={meter.unit} />
          {status?.last_index_type ? <Body muted>{status.last_index_type}</Body> : null}
          <Text style={[styles.window, { color: windowColor }]}>{windowText}</Text>
          {status?.address ? <Body muted>{status.address}</Body> : null}
          {status?.error ? <Body color={t.danger}>{status.error}</Body> : null}
        </Card>

        {!inWindow && (
          <Card>
            <Text style={[styles.window, { color: t.text }]}>Index nou</Text>
            <Body muted>
              {status?.window_start
                ? `Indexul se poate trimite doar în perioada de autocitire: ${formatDate(status.window_start)} – ${status.window_end ? formatDate(status.window_end) : '?'}. Atunci apare aici câmpul și butonul de fotografiat, iar tu primești notificare.`
                : 'Indexul se poate trimite doar în perioada de autocitire. Când E.ON / Electrica o anunță, apare aici câmpul și butonul de fotografiat, iar tu primești notificare.'}
            </Body>
          </Card>
        )}

        {inWindow && (
          <Card style={{ borderColor: submitted ? t.border : t.danger, borderWidth: 1 }}>
            <ScanButton
              prefix={meter.id.replace(/[^a-zA-Z0-9]/g, '_')}
              expectation={expectationFrom(history, meter.kind === 'electricitate' ? 1 : 3, status?.last_index)}
              decimals={0}
              unit={meter.unit}
              onPhoto={setPhoto}
              onValue={setValue}
            />
            <Field
              label={`Indexul de azi (${meter.unit})`}
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              placeholder={status?.last_index ? formatNumber(status.last_index, 0) : ''}
              hint="Doar cifrele întregi de pe contor."
              large
            />
            <Button
              title={submitted ? 'Corectează indexul' : 'Trimite indexul'}
              icon="send"
              onPress={onSubmit}
              loading={busy === 'submit'}
            />
          </Card>
        )}

        {/* Rezumat an */}
        <View style={styles.stats}>
          <Stat
            label={`Consum ${year}`}
            value={`${formatNumber(comparison.totalCurrent, 0)} ${meter.unit}`}
            note={
              comparison.deltaPct !== null
                ? `${comparison.deltaPct > 0 ? '+' : ''}${formatNumber(comparison.deltaPct, 1)}% față de ${year - 1}`
                : undefined
            }
            noteColor={comparison.deltaPct !== null && comparison.deltaPct > 0 ? t.danger : t.success}
          />
          <Stat
            label={billed.source === 'invoices' ? `Facturat ${year}` : `Plătit + de plată ${year}`}
            value={formatLei(billed.total)}
            note={billed.source === 'payments' ? 'din plățile înregistrate' : undefined}
          />
        </View>

        {unpaidTotal > 0.009 && (
          <Card style={{ borderColor: overdue ? t.danger : t.warning, borderWidth: 1 }}>
            <Text style={[styles.window, { color: overdue ? t.danger : t.warning }]}>
              {overdue ? 'Ai o factură restantă' : 'Ai de plată'}
            </Text>
            <Text style={[styles.big, { color: t.text }]}>{formatLei(unpaidTotal)}</Text>
          </Card>
        )}

        <SectionTitle>Consum lunar</SectionTitle>
        <Card>
          <YearChart
            points={comparison.points}
            year={year}
            color={color}
            unit={meter.unit}
            currentMonth={Number(today.slice(5, 7))}
          />
        </Card>

        <SectionTitle>Facturi {year}</SectionTitle>
        <Card>
          <InvoiceList
            invoices={thisYearInvoices}
            today={today}
            unit={meter.unit}
            // E.ON facturează în luna indexului; Electrica la începutul lunii următoare
            indexOf={(inv) => invoiceIndexDelta(inv.issue_date, monthly, provider === 'electrica' ? 1 : 0)}
          />
          <Body muted>
            Sub sumă: diferența de index față de factura anterioară, în {meter.unit}. „Estimat” = index estimat de
            furnizor; o diferență negativă înseamnă regularizare după o citire reală.
          </Body>
        </Card>

        {showPayments && (
          <>
            <SectionTitle>Plăți {year}</SectionTitle>
            <Card>
              <PaymentList payments={paymentsThisYear} />
            </Card>
          </>
        )}

        <Body muted>
          Cod {status?.external_id ?? '—'}. Actualizat {status?.fetched_at ? formatDateTime(status.fetched_at) : 'niciodată'}. Trage în
          jos ca să reîncarci tot istoricul.
        </Body>
      </Screen>
    </>
  );
}

function Stat({ label, value, note, noteColor }: { label: string; value: string; note?: string; noteColor?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.caption, { color: t.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      {note ? <Text style={[styles.caption, { color: noteColor ?? t.textMuted }]}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 13 },
  window: { fontSize: 15, fontWeight: '600' },
  big: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4 },
  statValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
