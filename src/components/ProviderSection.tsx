import { router } from 'expo-router';

import { MeterDrum } from '@/components/MeterDrum';
import { Badge, Body, Card, CardHeader, Chevron, SectionTitle } from '@/components/ui';
import type { Meter, ProviderStatus } from '@/db/types';
import { daysBetween, formatDate, formatLei, todayIso } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { AccountProvider } from '@/providers/sync';

export type StatusRow = ProviderStatus & Pick<Meter, 'name' | 'kind' | 'unit' | 'provider'>;

const TITLES: Record<AccountProvider, string> = { eon: 'E.ON', electrica: 'Electrica' };

export function ProviderSection({
  provider,
  connected,
  rows,
  unpaid = {},
}: {
  provider: AccountProvider;
  connected: boolean;
  rows: StatusRow[];
  /** Sumă neplătită per meter_id */
  unpaid?: Record<string, number>;
}) {
  const t = useTheme();
  const today = todayIso();

  if (!connected) {
    return (
      <>
        <SectionTitle>{TITLES[provider]}</SectionTitle>
        <Card onPress={() => router.push(`/cont/${provider}`)}>
          <CardHeader
            icon="link-variant"
            color={t.accent}
            title={`Conectează contul ${TITLES[provider]}`}
            subtitle="Ca să vezi fereastra de autocitire și să trimiți indexul din aplicație."
            right={<Chevron />}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionTitle>{TITLES[provider]}</SectionTitle>
      {rows.length === 0 && (
        <Card onPress={() => router.push(`/cont/${provider}`)}>
          <Body muted>Niciun contor găsit încă. Atinge ca să verifici contul.</Body>
        </Card>
      )}
      {rows.map((r) => {
        const submitted = r.submitted_index !== null;
        const daysLeft = r.window_end ? daysBetween(today, r.window_end) : null;
        return (
          <Card key={r.meter_id} onPress={() => router.push(`/contor/${encodeURIComponent(r.meter_id)}`)}>
            <CardHeader
              icon={r.kind === 'gaz' ? 'fire' : 'lightning-bolt-outline'}
              color={r.kind === 'gaz' ? t.gas : t.electricity}
              title={r.name}
              subtitle={
                r.window_start
                  ? `Autocitire ${formatDate(r.window_start)} – ${r.window_end ? formatDate(r.window_end) : '?'}`
                  : 'Perioada de autocitire nu e anunțată încă'
              }
              right={
                submitted ? (
                  <Badge text="trimis" color={t.success} />
                ) : r.in_window ? (
                  <Badge text={daysLeft !== null && daysLeft <= 0 ? 'ultima zi' : 'de trimis'} color={t.danger} />
                ) : (
                  <Chevron />
                )
              }
            />
            <MeterDrum value={r.last_index} unit={r.unit} size="small" />
            {unpaid[r.meter_id] ? <Body color={t.warning}>De plată: {formatLei(unpaid[r.meter_id])}</Body> : null}
            {r.error ? <Body color={t.danger}>{r.error}</Body> : null}
          </Card>
        );
      })}
    </>
  );
}
