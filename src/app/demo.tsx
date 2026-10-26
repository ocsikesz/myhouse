import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { recognizeText } from 'casamea-native';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { Body, Screen } from '@/components/ui';
import {
  addReading,
  saveProviderInvoices,
  saveProviderMonthly,
  saveProviderPayments,
  saveProviderStatus,
  upsertMeter,
} from '@/db/repo';
import { addMonths, currentMonth, todayIso } from '@/lib/format';
import { findMeterCandidates } from '@/lib/meterOcr';

/**
 * Date de probă pentru capturile de ecran din testul automat (casamea://demo).
 * Contorul demo are id-ul eon:DEMO; nu e legat de niciun cont real.
 */
const DEMO_ID = 'eon:DEMO';

export default function DemoScreen() {
  const db = useSQLiteContext();
  const { go } = useLocalSearchParams<{ go?: string }>();
  const [status, setStatus] = useState('Se încarcă datele demo…');

  useEffect(() => {
    (async () => {
      if (go === 'ocr') {
        // Test OCR pe o poză sintetică de contor (06105,742 m³), rezultatul ajunge în logcat
        try {
          const { TEST_METER_JPEG_BASE64 } = await import('@/lib/testMeterImage');
          const f = new File(Paths.cache, 'test-meter.jpg');
          f.write(TEST_METER_JPEG_BASE64, { encoding: 'base64' });
          const ocr = await recognizeText(f.uri);
          const c = findMeterCandidates(ocr, { previous: 6030, typicalDelta: 60, maxDecimals: 3 });
          const msg = `[OCR-TEST] lines=${JSON.stringify(ocr.lines.map((l) => l.text))} best=${c[0]?.value ?? 'none'} all=${JSON.stringify(c)}`;
          console.log(msg);
          setStatus(msg);
        } catch (e) {
          const msg = `[OCR-TEST] error=${e instanceof Error ? e.message : String(e)}`;
          console.log(msg);
          setStatus(msg);
        }
        return;
      }
      const today = todayIso();
      const month = currentMonth();
      await upsertMeter(db, { id: DEMO_ID, name: 'Gaz (E.ON)', kind: 'gaz', provider: 'eon', unit: 'm³', sort_order: 100 });
      const pattern = [142, 128, 96, 61, 34, 18, 12, 11, 19, 48, 97, 138];
      const monthly = [];
      for (let i = 0; i < 22; i++) {
        const m = addMonths(month, -i);
        const mi = Number(m.slice(5, 7)) - 1;
        const factor = m.startsWith(today.slice(0, 4)) ? 0.9 : 1;
        monthly.push({ meter_id: DEMO_ID, month: m, consumption: Math.round(pattern[mi] * factor), index_value: null, reading_type: null });
      }
      await saveProviderMonthly(db, monthly);
      await saveProviderStatus(db, {
        meter_id: DEMO_ID,
        external_id: '002100234567',
        address: 'Str. Exemplu 10, ap. 5, Târgu Mureș',
        window_start: today,
        window_end: addMonths(month, 0) + '-28',
        in_window: 1,
        last_index: 6030,
        last_index_date: null,
        last_index_type: 'Autocitire',
        submitted_index: null,
        submitted_at: null,
        submit_info: JSON.stringify({ ablbelnr: 'DEMO' }),
        fetched_at: new Date().toISOString(),
        error: null,
      });
      await addReading(db, { meterId: DEMO_ID, value: 6030, readAt: today, source: 'eon' });
      const invoices = [0, 1, 2, 3].map((k) => {
        const m = addMonths(month, -k);
        return {
          invoice_number: `DEMO-${m}`,
          issue_date: `${m}-05`,
          due_date: `${m}-25`,
          amount: [212.4, 118.9, 64.2, 41.75][k],
          unpaid: k === 0 ? 212.4 : 0,
          paid: k === 0 ? 0 : 1,
        };
      });
      await saveProviderInvoices(db, DEMO_ID, invoices, true);
      await saveProviderPayments(db, [{ meter_id: DEMO_ID, paid_on: today, amount: 118.9, reference: '' }]);
      router.replace((go === 'istoric' ? '/istoric' : `/contor/${encodeURIComponent(DEMO_ID)}`) as Href);
    })();
  }, [db, go]);

  return (
    <Screen>
      <Body muted>{status}</Body>
    </Screen>
  );
}
