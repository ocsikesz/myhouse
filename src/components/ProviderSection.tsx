import { router } from 'expo-router';

import { Badge, Body, Card, Row, SectionTitle, Title } from '@/components/ui';
import type { Meter, ProviderStatus } from '@/db/types';
import { daysBetween, formatDate, formatNumber, todayIso } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { AccountProvider } from '@/providers/sync';

export type StatusRow = ProviderStatus & Pick<Meter, 'name' | 'kind' | 'unit' | 'provider'>;

const TITLES: Record<AccountProvider, string> = { eon: 'E.ON', electrica: 'Electrica' };

export function ProviderSection({
  provider,
  connected,
  rows,
}: {
  provider: AccountProvider;
  connected: boolean;
  rows: StatusRow[];
}) {
  const t = useTheme();
  const today = todayIso();

  if (!connected) {
    return (
      <>
        <SectionTitle>{TITLES[provider]}</SectionTitle>
        <Card onPress={() => router.push(`/cont/${provider}`)}>
          <Title>Conectează contul {TITLES[provider]}</Title>
          <Body muted>Ca să vezi fereastra de autocitire și să trimiți indexul din aplicație.</Body>
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
            <Row style={{ justifyContent: 'space-between' }}>
              <Title color={r.kind === 'gaz' ? t.gas : t.electricity}>{r.name}</Title>
              {submitted ? (
                <Badge text="trimis" color={t.success} />
              ) : r.in_window ? (
                <Badge text={daysLeft !== null && daysLeft <= 0 ? 'ultima zi' : 'de trimis'} color={t.danger} />
              ) : null}
            </Row>
            <Body muted>
              Index facturat: {r.last_index !== null ? `${formatNumber(r.last_index, 0)} ${r.unit}` : '—'}
              {r.window_start ? ` · autocitire ${formatDate(r.window_start)}–${r.window_end ? formatDate(r.window_end) : '?'}` : ''}
            </Body>
            {r.error ? <Body color={t.danger}>{r.error}</Body> : null}
          </Card>
        );
      })}
    </>
  );
}
