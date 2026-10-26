import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { ProviderSection } from '@/components/ProviderSection';
import { Body, Card, Screen, SectionTitle, Title } from '@/components/ui';
import { listProviderStatuses, listUnpaidInvoices } from '@/db/repo';
import { info } from '@/lib/dialogs';
import { useTheme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';
import { getCredentials } from '@/providers/credentials';
import { syncAll } from '@/providers/sync';

export default function UtilitiesScreen() {
  const t = useTheme();
  const db = useSQLiteContext();
  const [refreshing, setRefreshing] = useState(false);

  const { data, reload } = useDbQuery(async (d) => ({
    statuses: await listProviderStatuses(d),
    unpaid: (await listUnpaidInvoices(d)).reduce<Record<string, number>>((acc, i) => {
      acc[i.meter_id] = (acc[i.meter_id] ?? 0) + i.unpaid;
      return acc;
    }, {}),
    eon: !!(await getCredentials('eon')),
    electrica: !!(await getCredentials('electrica')),
  }));

  async function onRefresh() {
    setRefreshing(true);
    const r = await syncAll(db, true);
    setRefreshing(false);
    const errors = Object.values(r)
      .filter((x) => x.status === 'auth' || x.status === 'error')
      .map((x) => ('message' in x ? x.message : ''));
    if (errors.length) info('Unele conturi nu s-au actualizat', errors.join('\n'));
    reload();
  }

  const statuses = data?.statuses ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <SectionTitle>Casa</SectionTitle>
      <Card onPress={() => router.push('/apa')}>
        <Title color={t.water}>Apă rece</Title>
        <Body muted>Deservcom · bucătărie și baie · trimitere pe WhatsApp</Body>
      </Card>
      <Card onPress={() => router.push('/asociatie')}>
        <Title color={t.accent}>Asociația de proprietari</Title>
        <Body muted>Consumul lunar · plătit / neplătit · scadență</Body>
      </Card>

      {data && (
        <>
          <ProviderSection
            provider="eon"
            connected={data.eon}
            rows={statuses.filter((s) => s.provider === 'eon')}
            unpaid={data.unpaid}
          />
          <ProviderSection
            provider="electrica"
            connected={data.electrica}
            rows={statuses.filter((s) => s.provider === 'electrica')}
            unpaid={data.unpaid}
          />
        </>
      )}
      <Body muted>Trage în jos ca să actualizezi datele de la furnizori.</Body>
    </Screen>
  );
}
