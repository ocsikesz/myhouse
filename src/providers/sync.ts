import type { SQLiteDatabase } from 'expo-sqlite';

import {
  addReading,
  deactivateMissingMeters,
  getProviderStatus,
  latestReading,
  saveProviderStatus,
  getSetting,
  saveProviderInvoices,
  saveProviderMonthly,
  saveProviderPayments,
  setProviderStatusError,
  setSetting,
  upsertMeter,
} from '@/db/repo';
import type { MeterKind, Provider, ProviderStatus } from '@/db/types';
import { historyStart, todayIso } from '@/lib/format';

import { getCredentials, getTokens, saveTokens } from './credentials';
import { ElectricaClient, electricaReadingsToMonthly, type ElectricaTokens } from './electrica';
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
  /** Istoric anual — doar când a fost cerut (vezi HISTORY_MAX_AGE) */
  history?: RemoteHistory;
}

export interface RemoteHistory {
  monthly: { month: string; consumption: number | null; index: number | null; readingType: string | null }[];
  invoices: { number: string; issueDate: string | null; dueDate: string | null; amount: number; unpaid: number; paid: boolean }[];
  /** true = lista conține și facturile plătite */
  invoicesComplete: boolean;
  payments: { date: string; amount: number; reference: string }[];
}

/** Istoricul (facturi, consum) se reîmprospătează mai rar decât fereastra de citire */
const HISTORY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const historyKey = (p: AccountProvider) => `history.last_run.${p}`;


async function historyDue(db: SQLiteDatabase, provider: AccountProvider, force: boolean): Promise<boolean> {
  if (force) return true;
  const last = await getSetting(db, historyKey(provider));
  return !last || Date.now() - Date.parse(last) > HISTORY_MAX_AGE_MS;
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

    if (r.history) {
      const h = r.history;
      await saveProviderMonthly(
        db,
        h.monthly.map((m) => ({
          meter_id: id,
          month: m.month,
          consumption: m.consumption,
          index_value: m.index,
          reading_type: m.readingType,
        })),
      );
      await saveProviderInvoices(
        db,
        id,
        h.invoices.map((i) => ({
          invoice_number: i.number,
          issue_date: i.issueDate,
          due_date: i.dueDate,
          amount: i.amount,
          unpaid: i.unpaid,
          paid: i.paid ? 1 : 0,
        })),
        h.invoicesComplete,
      );
      await saveProviderPayments(
        db,
        h.payments.map((p) => ({ meter_id: id, paid_on: p.date, amount: p.amount, reference: p.reference })),
      );
    }

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

export async function makeElectricaClient(): Promise<ElectricaClient | null> {
  const creds = await getCredentials('electrica');
  if (!creds) return null;
  const tokens = await getTokens<ElectricaTokens>('electrica');
  return new ElectricaClient(creds, tokens, (t) => saveTokens('electrica', t));
}

export async function syncElectrica(db: SQLiteDatabase, force = false): Promise<SyncResult> {
  const client = await makeElectricaClient();
  if (!client) return { status: 'not_configured' };
  try {
    const today = todayIso();
    const withHistory = await historyDue(db, 'electrica', force);
    const from = historyStart(today);
    const places = await client.getPlaces();
    const remote: RemoteMeter[] = [];
    // Facturile vin per cod client — le cerem o singură dată pentru fiecare
    const invoicesCache = new Map<string, Awaited<ReturnType<ElectricaClient['getInvoices']>>>();
    for (const p of places) {
      const m = await client.getMeter(p.nlc, today);
      let history: RemoteHistory | undefined;
      if (withHistory) {
        const key = `${p.clientCode}|${p.contractAccount}`;
        if (!invoicesCache.has(key)) invoicesCache.set(key, await client.getInvoices(p.clientCode, p.contractAccount, from, today));
        // Consumul lunii se calculează din citirea anterioară, deci filtrăm după calcul
        const readings = await client.getReadings(p.clientCode, p.nlc);
        history = {
          monthly: electricaReadingsToMonthly(readings).filter((r) => r.month >= from.slice(0, 7)),
          invoices: invoicesCache.get(key) ?? [],
          invoicesComplete: true,
          payments: [],
        };
      }
      remote.push({
        history,
        provider: 'electrica',
        externalId: p.nlc,
        kind: p.serviceType.toLowerCase().includes('gaz') ? 'gaz' : 'electricitate',
        address: p.address,
        windowStart: m.windowStart,
        windowEnd: m.windowEnd,
        inWindow: m.inWindow,
        lastIndex: m.lastIndex,
        lastIndexDate: m.lastIndexDate,
        lastIndexType: m.lastIndexType,
        submittedIndex: m.submittedIndex,
        submittedAt: m.submittedAt,
        submitInfo: m.serieContor && m.registerCode ? { serieContor: m.serieContor, registerCode: m.registerCode } : null,
      });
    }
    await storeRemoteMeters(db, 'electrica', remote);
    if (withHistory) await setSetting(db, historyKey('electrica'), new Date().toISOString());
    return { status: 'ok', meters: remote.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await setProviderStatusError(db, 'electrica', message);
    if (e instanceof AuthRequiredError) return { status: 'auth', message };
    return { status: 'error', message };
  }
}

export async function syncEon(db: SQLiteDatabase, force = false): Promise<SyncResult> {
  const client = await makeEonClient();
  if (!client) return { status: 'not_configured' };
  try {
    const today = todayIso();
    const withHistory = await historyDue(db, 'eon', force);
    const from = historyStart(today);
    const contracts = await client.getContracts();
    const remote: RemoteMeter[] = [];
    for (const c of contracts) {
      const kind: MeterKind | null = c.utilityType === '02' ? 'gaz' : c.utilityType === '01' ? 'electricitate' : null;
      if (!kind) continue;
      const idx = await client.getMeterIndex(c.accountContract, today);
      let history: RemoteHistory | undefined;
      if (withHistory) {
        const consumption = await client.getMonthlyConsumption(c.accountContract);
        const indexes = await client.getMeterHistory(c.accountContract);
        const byMonth = new Map<string, RemoteHistory['monthly'][number]>();
        for (const r of consumption) byMonth.set(r.month, { ...r });
        for (const r of indexes) {
          const prev = byMonth.get(r.month);
          byMonth.set(r.month, { month: r.month, consumption: prev?.consumption ?? null, index: r.index, readingType: r.readingType });
        }
        const inv = await client.getInvoices(c.accountContract);
        history = {
          monthly: [...byMonth.values()].filter((r) => r.month >= from.slice(0, 7) && r.month <= today.slice(0, 7)),
          invoices: inv.invoices,
          invoicesComplete: inv.complete,
          payments: await client.getPayments(c.accountContract, from),
        };
      }
      remote.push({
        history,
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
    if (withHistory) await setSetting(db, historyKey('eon'), new Date().toISOString());
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
  photoUri: string | null = null,
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
    } else if (provider === 'electrica') {
      const client = await makeElectricaClient();
      if (!client) return { ok: false, message: 'Contul Electrica nu este configurat.' };
      if (!info.serieContor || !info.registerCode) return { ok: false, message: 'Lipsesc datele contorului (serie / registru).' };
      result = await client.submitIndex(status.external_id, info.serieContor, info.registerCode, value);
    } else {
      return { ok: false, message: `Furnizor necunoscut: ${provider}` };
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  if (result.ok) {
    const now = new Date().toISOString();
    await saveProviderStatus(db, { ...status, submitted_index: value, submitted_at: now });
    const id = await addReading(db, {
      meterId,
      value,
      readAt: todayIso(),
      source: 'manual',
      photoUri,
      note: 'Autocitire trimisă din aplicație',
    });
    await db.runAsync('UPDATE readings SET sent_at = ? WHERE id = ?', now, id);
  }
  return result;
}

/** `force` = reîncarcă și istoricul (facturi, consum), nu doar fereastra de citire. */
export function syncProvider(db: SQLiteDatabase, provider: AccountProvider, force = false): Promise<SyncResult> {
  return provider === 'eon' ? syncEon(db, force) : syncElectrica(db, force);
}

export const LAST_SYNC = 'sync.last_run';

export async function syncAll(db: SQLiteDatabase, force = false): Promise<Record<AccountProvider, SyncResult>> {
  const result = { eon: await syncProvider(db, 'eon', force), electrica: await syncProvider(db, 'electrica', force) };
  await setSetting(db, LAST_SYNC, new Date().toISOString());
  return result;
}
