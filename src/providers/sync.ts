import type { SQLiteDatabase } from 'expo-sqlite';

import {
  addReading,
  deactivateMissingMeters,
  getProviderStatus,
  latestReading,
  saveProviderStatus,
  setProviderStatusError,
  upsertMeter,
} from '@/db/repo';
import type { MeterKind, Provider, ProviderStatus } from '@/db/types';
import { todayIso } from '@/lib/format';

import { getCredentials, getTokens, saveTokens } from './credentials';
import { EonClient, type EonTokens } from './eon';
import { AuthRequiredError } from './http';

export type AccountProvider = Exclude<Provider, 'deservcom'>;

export type SyncResult =
  | { status: 'ok'; meters: number }
  | { status: 'not_configured' }
  | { status: 'auth'; message: string }
  | { status: 'error'; message: string };

/** Ce aflăm de la furnizor despre un contor, independent de furnizor. */
export interface RemoteMeter {
  provider: AccountProvider;
  externalId: string;
  kind: MeterKind;
  address: string;
  windowStart: string | null;
  windowEnd: string | null;
  inWindow: boolean;
  lastIndex: number | null;
  lastIndexDate: string | null;
  lastIndexType: string | null;
  submittedIndex: number | null;
  submittedAt: string | null;
  submitInfo: Record<string, string> | null;
}

export const meterIdFor = (provider: string, externalId: string) => `${provider}:${externalId}`;

const KIND_LABEL: Record<MeterKind, string> = { gaz: 'Gaz', electricitate: 'Energie electrică', apa: 'Apă' };
const PROVIDER_LABEL: Record<string, string> = { eon: 'E.ON', electrica: 'Electrica' };
const UNIT: Record<MeterKind, string> = { gaz: 'm³', electricitate: 'kWh', apa: 'm³' };

/** Salvează contoarele furnizorului: meters + provider_status + istoricul indexului facturat. */
export async function storeRemoteMeters(db: SQLiteDatabase, provider: RemoteMeter['provider'], remote: RemoteMeter[]) {
  const now = new Date().toISOString();
  const today = todayIso();
  const sameKindCount = (k: MeterKind) => remote.filter((r) => r.kind === k).length;

  for (const [i, r] of remote.entries()) {
    const id = meterIdFor(provider, r.externalId);
    const base = `${KIND_LABEL[r.kind]} (${PROVIDER_LABEL[provider]})`;
    const name = sameKindCount(r.kind) > 1 && r.address ? `${base} – ${r.address}` : base;
    await upsertMeter(db, {
      id,
      name,
      kind: r.kind,
      provider,
      unit: UNIT[r.kind],
      sort_order: (provider === 'eon' ? 100 : 200) + i,
    });

    // Păstrăm trimiterea făcută din aplicație dacă furnizorul încă n-o raportează
    const prev = await getProviderStatus(db, id);
    let submittedIndex = r.submittedIndex;
    let submittedAt = r.submittedAt;
    if (submittedIndex === null && prev?.submitted_at && r.windowStart && prev.submitted_at.slice(0, 10) >= r.windowStart) {
      submittedIndex = prev.submitted_index;
      submittedAt = prev.submitted_at;
    }

    const status: ProviderStatus = {
      meter_id: id,
      external_id: r.externalId,
      address: r.address || null,
      window_start: r.windowStart,
      window_end: r.windowEnd,
      in_window: r.inWindow ? 1 : 0,
      last_index: r.lastIndex,
      last_index_date: r.lastIndexDate,
      last_index_type: r.lastIndexType,
      submitted_index: submittedIndex,
      submitted_at: submittedAt,
      submit_info: r.submitInfo ? JSON.stringify(r.submitInfo) : null,
      fetched_at: now,
      error: null,
    };
    await saveProviderStatus(db, status);

    // Istoric: înregistrăm indexul facturat când se schimbă
    if (r.lastIndex !== null) {
      const last = await latestReading(db, id);
      if (!last || last.value !== r.lastIndex) {
        await addReading(db, {
          meterId: id,
          value: r.lastIndex,
          readAt: r.lastIndexDate ?? today,
          source: provider,
          note: r.lastIndexType,
        });
      }
    }
  }
  await deactivateMissingMeters(
    db,
    provider,
    remote.map((r) => meterIdFor(provider, r.externalId)),
  );
}

export async function makeEonClient(): Promise<EonClient | null> {
  const creds = await getCredentials('eon');
  if (!creds) return null;
  const tokens = await getTokens<EonTokens>('eon');
  return new EonClient(creds, tokens, (t) => saveTokens('eon', t));
}

export async function syncEon(db: SQLiteDatabase): Promise<SyncResult> {
  const client = await makeEonClient();
  if (!client) return { status: 'not_configured' };
  try {
    const today = todayIso();
    const contracts = await client.getContracts();
    const remote: RemoteMeter[] = [];
    for (const c of contracts) {
      const kind: MeterKind | null = c.utilityType === '02' ? 'gaz' : c.utilityType === '01' ? 'electricitate' : null;
      if (!kind) continue;
      const idx = await client.getMeterIndex(c.accountContract, today);
      remote.push({
        provider: 'eon',
        externalId: c.accountContract,
        kind,
        address: c.address,
        windowStart: idx.windowStart,
        windowEnd: idx.windowEnd,
        inWindow: idx.inWindow,
        lastIndex: idx.lastIndex,
        lastIndexDate: null,
        lastIndexType: idx.readingType,
        submittedIndex: idx.submittedIndex,
        submittedAt: idx.submittedAt,
        submitInfo: idx.ablbelnr ? { ablbelnr: idx.ablbelnr } : null,
      });
    }
    await storeRemoteMeters(db, 'eon', remote);
    return { status: 'ok', meters: remote.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setProviderStatusError(db, 'eon', message);
    if (e instanceof AuthRequiredError) return { status: 'auth', message };
    return { status: 'error', message };
  }
}

/** Trimite indexul la furnizor și îl înregistrează local. */
export async function submitProviderIndex(
  db: SQLiteDatabase,
  meterId: string,
  value: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const status = await getProviderStatus(db, meterId);
  if (!status) return { ok: false, message: 'Contorul nu a fost sincronizat încă.' };
  const info = status.submit_info ? (JSON.parse(status.submit_info) as Record<string, string>) : {};
  const provider = meterId.split(':')[0];

  let result: { ok: true } | { ok: false; message: string };
  try {
    if (provider === 'eon') {
      const client = await makeEonClient();
      if (!client) return { ok: false, message: 'Contul E.ON nu este configurat.' };
      if (!info.ablbelnr) return { ok: false, message: 'Lipsește ID-ul contorului. Perioada de citire este deschisă?' };
      result = await client.submitIndex(status.external_id, info.ablbelnr, value);
    } else {
      return { ok: false, message: `Furnizor necunoscut: ${provider}` };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  if (result.ok) {
    const now = new Date().toISOString();
    await saveProviderStatus(db, { ...status, submitted_index: value, submitted_at: now });
    const id = await addReading(db, { meterId, value, readAt: todayIso(), source: 'manual', note: 'Autocitire trimisă din aplicație' });
    await db.runAsync('UPDATE readings SET sent_at = ? WHERE id = ?', now, id);
  }
  return result;
}

export function syncProvider(db: SQLiteDatabase, provider: AccountProvider): Promise<SyncResult> {
  if (provider === 'eon') return syncEon(db);
  return Promise.resolve({ status: 'not_configured' });
}

export async function syncAll(db: SQLiteDatabase): Promise<Record<AccountProvider, SyncResult>> {
  return { eon: await syncProvider(db, 'eon'), electrica: await syncProvider(db, 'electrica') };
}
