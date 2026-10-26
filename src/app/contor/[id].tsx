import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { View } from 'react-native';

import { Badge, Body, Button, Card, Divider, Field, Row, Screen, SectionTitle, Title } from '@/components/ui';
import { getMeter, getProviderStatus, listReadings } from '@/db/repo';
import { checkNewReading } from '@/lib/consumption';
import { confirm, info } from '@/lib/dialogs';
import { daysBetween, formatDate, formatDateTime, formatNumber, parseDecimal, todayIso } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';
import { submitProviderIndex, syncProvider, type AccountProvider } from '@/providers/sync';

export default function ProviderMeterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const t = useTheme();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState<'sync' | 'submit' | null>(null);

  const { data, reload } = useDbQuery(
    async (d) => ({
      meter: await getMeter(d, id),
      status: await getProviderStatus(d, id),
      history: await listReadings(d, id, 12),
    }),
    [id],
  );

  if (!data?.meter) return <Screen>{null}</Screen>;
  const { meter, status, history } = data;
  const provider = meter.provider as AccountProvider;
  const today = todayIso();
  const color = meter.kind === 'gaz' ? t.gas : t.electricity;
  const inWindow = !!status?.in_window;
  const submitted = status?.submitted_index !== null && status?.submitted_index !== undefined;
  const daysLeft = status?.window_end ? daysBetween(today, status.window_end) : null;

  async function onSync() {
    setBusy('sync');
    const r = await syncProvider(db, provider);
    setBusy(null);
    if (r.status === 'auth') {
      const go = await confirm('Reconectare necesară', r.message, 'Reconectează');
      if (go) router.push(`/cont/${provider}`);
    } else if (r.status === 'error') {
      info('Sincronizare eșuată', r.message);
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
    const ok = await confirm(
      'Trimiți indexul?',
      `${meter!.name}: ${formatNumber(v, 0)} ${meter!.unit}`,
      'Trimite',
    );
    if (!ok) return;

    setBusy('submit');
    const r = await submitProviderIndex(db, meter!.id, v);
    setBusy(null);
    if (r.ok) {
      setValue('');
      info('Index trimis', 'Furnizorul a primit indexul.');
      reload();
    } else {
      info('Indexul nu a fost trimis', r.message);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: meter.name }} />
      <Screen>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Title color={color}>{meter.name}</Title>
            {submitted ? (
              <Badge text="trimis" color={t.success} />
            ) : inWindow ? (
              <Badge text="fereastră deschisă" color={t.danger} />
            ) : (
              <Badge text="în afara ferestrei" color={t.textMuted} />
            )}
          </Row>
          {status?.address ? <Body muted>{status.address}</Body> : null}
          <Body muted>Cod: {status?.external_id ?? '—'}</Body>
          <Divider />
          <Body>
            Ultimul index facturat:{' '}
            {status?.last_index !== null && status?.last_index !== undefined
              ? `${formatNumber(status.last_index, 0)} ${meter.unit}`
              : '—'}
            {status?.last_index_type ? ` (${status.last_index_type})` : ''}
          </Body>
          <Body>
            Perioadă autocitire:{' '}
            {status?.window_start
              ? `${formatDate(status.window_start)} – ${status.window_end ? formatDate(status.window_end) : '?'}`
              : 'necunoscută'}
          </Body>
          {inWindow && daysLeft !== null && !submitted ? (
            <Body color={t.danger}>{daysLeft <= 0 ? 'Azi e ultima zi!' : `Mai ai ${daysLeft} ${daysLeft === 1 ? 'zi' : 'zile'}.`}</Body>
          ) : null}
          {submitted ? (
            <Body color={t.success}>
              Trimis: {formatNumber(status!.submitted_index!, 0)} {meter.unit}
              {status?.submitted_at ? ` · ${formatDate(status.submitted_at.slice(0, 10))}` : ''}
            </Body>
          ) : null}
          {status?.error ? <Body color={t.danger}>{status.error}</Body> : null}
          <Body muted>
            Actualizat: {status?.fetched_at ? formatDateTime(status.fetched_at) : 'niciodată'}
          </Body>
          <Button title="Actualizează acum" variant="secondary" onPress={onSync} loading={busy === 'sync'} />
        </Card>

        <SectionTitle>Trimite index</SectionTitle>
        <Card>
          <Field
            label={`Index nou (${meter.unit})`}
            value={value}
            onChangeText={setValue}
            keyboardType="number-pad"
            placeholder={status?.last_index ? formatNumber(status.last_index, 0) : ''}
            hint="Doar cifrele întregi de pe contor, fără zecimale."
          />
          <Button
            title={submitted ? 'Trimite din nou (corectare)' : 'Trimite indexul'}
            onPress={onSubmit}
            loading={busy === 'submit'}
            disabled={!inWindow}
          />
          {!inWindow ? <Body muted>Poți trimite doar în perioada de autocitire.</Body> : null}
        </Card>

        <SectionTitle>Istoric</SectionTitle>
        <Card>
          {history.length === 0 && <Body muted>Fără istoric încă.</Body>}
          {history.map((r, i) => (
            <View key={r.id}>
              {i > 0 && <Divider />}
              <Row style={{ justifyContent: 'space-between' }}>
                <Body>
                  {formatNumber(r.value, 0)} {meter.unit}
                </Body>
                <Body muted>
                  {formatDate(r.read_at)}
                  {r.note ? ` · ${r.note}` : ''}
                </Body>
              </Row>
            </View>
          ))}
        </Card>
      </Screen>
    </>
  );
}
