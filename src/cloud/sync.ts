import * as ExpoCrypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { downloadAsync, FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, queueSync, setSetting, type SyncKind } from '@/db/repo';
import type { AssociationPayment, Meter, Reading } from '@/db/types';
import { deletePhoto } from '@/lib/photos';
import { DEVICE, SHARED_SETTINGS } from '@/lib/settingsKeys';
import { clearAccount, getCredentials, saveCredentials, type Credentials } from '@/providers/credentials';

import {
  activeSession,
  CloudError,
  familyKey,
  fetchRecord,
  fetchRecordsSince,
  storageHeaders,
  storageUrl,
  upsertRecords,
  type CloudRecord,
  type Session,
} from './client';
import { decryptJson, encryptJson } from './crypto';
import { emitCloudChanges, setQueueHandler } from './queue';

/** Setări locale ale sincronizării */
export const CLOUD = {
  cursor: 'cloud.pull_cursor',
  lastSync: 'cloud.last_sync',
  error: 'cloud.error',
  /** Valoarea LAST_SYNC (furnizori) pentru care am trimis deja instantaneul */
  snapshotOf: 'cloud.snapshot_of',
  /** server_ts al instantaneului furnizorilor aplicat deja pe telefonul ăsta */
  snapshotApplied: 'cloud.snapshot_applied',
} as const;

/** Aceeași cheie ca în providers/sync.ts (nu importăm modulul, ca să evităm cicluri) */
const PROVIDER_LAST_SYNC = 'sync.last_run';
const PROVIDERS = ['eon', 'electrica'] as const;

export type CloudSyncResult = { ok: true; pushed: number; pulled: number } | { ok: false; message: string } | { ok: 'off' };

let running: Promise<CloudSyncResult> | null = null;

/** Sincronizează acum (o singură rulare odată). */
export function cloudSync(db: SQLiteDatabase): Promise<CloudSyncResult> {
  if (!running) {
    running = run(db).finally(() => {
      running = null;
    });
  }
  return running;
}

// La orice modificare locală: trimitem după câteva secunde (mai multe modificări → o singură rulare)
let timer: ReturnType<typeof setTimeout> | null = null;
setQueueHandler((db) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    cloudSync(db).catch(() => {});
  }, 2500);
});

async function run(db: SQLiteDatabase): Promise<CloudSyncResult> {
  let session: Session | null;
  try {
    session = await activeSession();
  } catch (e) {
    return fail(db, e);
  }
  if (!session) return { ok: 'off' };
  try {
    await queueProviderSnapshotIfNew(db);
    const pushed = await push(db, session);
    let pulled = await pull(db, session);
    if (await pullProviderSnapshot(db, session)) pulled++;
    await setSetting(db, CLOUD.lastSync, new Date().toISOString());
    await setSetting(db, CLOUD.error, '');
    if (pulled > 0) emitCloudChanges();
    return { ok: true, pushed, pulled };
  } catch (e) {
    return fail(db, e);
  }
}

async function fail(db: SQLiteDatabase, e: unknown): Promise<CloudSyncResult> {
  const message = e instanceof Error ? e.message : String(e);
  await setSetting(db, CLOUD.error, message).catch(() => {});
  return { ok: false, message };
}

// ---------- Trimitere ----------

async function push(db: SQLiteDatabase, s: Session): Promise<number> {
  const items = await db.getAllAsync<{ kind: SyncKind; uid: string; queued_at: string }>(
    'SELECT kind, uid, queued_at FROM sync_outbox ORDER BY queued_at',
  );
  if (items.length === 0) return 0;
  const key = await familyKey();
  const records: CloudRecord[] = [];
  const done: typeof items = [];
  for (const it of items) {
    const rec = await buildRecord(db, s, key, it.kind, it.uid);
    if (rec === 'skip') continue;
    records.push(rec);
    done.push(it);
  }
  await upsertRecords(s, records);
  // Scoatem din coadă doar ce n-a mai fost modificat între timp
  for (const it of done) {
    await db.runAsync('DELETE FROM sync_outbox WHERE kind = ? AND uid = ? AND queued_at <= ?', it.kind, it.uid, it.queued_at);
  }
  return records.length;
}

async function buildRecord(
  db: SQLiteDatabase,
  s: Session,
  key: string | null,
  kind: SyncKind,
  uid: string,
): Promise<CloudRecord | 'skip'> {
  const gone: CloudRecord = { kind, uid, data: null, deleted: true };
  switch (kind) {
    case 'reading': {
      const r = await db.getFirstAsync<Reading>('SELECT * FROM readings WHERE uid = ?', uid);
      if (!r) return gone;
      let remote = r.photo_remote ?? null;
      if (r.photo_uri && !remote) {
        remote = await uploadPhoto(s, r.photo_uri, uid);
        await db.runAsync('UPDATE readings SET photo_remote = ? WHERE uid = ?', remote, uid);
      }
      const meter = await db.getFirstAsync<Meter>('SELECT * FROM meters WHERE id = ?', r.meter_id);
      return {
        kind,
        uid,
        deleted: false,
        data: {
          meter_id: r.meter_id,
          meter: meter ? { name: meter.name, kind: meter.kind, provider: meter.provider, unit: meter.unit, sort_order: meter.sort_order } : null,
          value: r.value,
          read_at: r.read_at,
          source: r.source,
          sent_at: r.sent_at,
          note: r.note,
          photo: r.photo_uri ? remote : null,
        },
      };
    }
    case 'assoc': {
      const p = await db.getFirstAsync<AssociationPayment>('SELECT * FROM association_payments WHERE month = ?', uid);
      if (!p) return gone;
      return { kind, uid, deleted: false, data: { amount: p.amount, due_date: p.due_date, paid_at: p.paid_at, note: p.note } };
    }
    case 'setting': {
      const value = await getSetting(db, uid);
      return value === null ? gone : { kind, uid, deleted: false, data: { value } };
    }
    case 'credentials': {
      if (!key) return 'skip';
      const c = await getCredentials(uid as (typeof PROVIDERS)[number]);
      if (!c) return gone;
      return { kind, uid, deleted: false, data: { enc: encryptJson(key, c, ExpoCrypto.getRandomBytes(12)) } };
    }
    case 'provider':
      return { kind, uid, deleted: false, data: await buildProviderSnapshot(db) };
  }
}

// ---------- Aducere ----------

async function pull(db: SQLiteDatabase, s: Session): Promise<number> {
  let cursor = (await getSetting(db, CLOUD.cursor)) || null;
  let applied = 0;
  for (;;) {
    const batch = await fetchRecordsSince(s, cursor);
    if (batch.length === 0) break;
    // Conturile primele: decid dacă telefonul ia datele furnizorilor din cloud.
    // Instantaneul furnizorilor se aduce separat (pullProviderSnapshot), nu din fluxul ăsta.
    const ordered = [...batch.filter((r) => r.kind === 'credentials'), ...batch.filter((r) => r.kind !== 'credentials' && r.kind !== 'provider')];
    for (const rec of ordered) {
      const pending = await db.getFirstAsync('SELECT 1 FROM sync_outbox WHERE kind = ? AND uid = ?', rec.kind, rec.uid);
      // Modificarea locală netrimisă câștigă; pleacă la următoarea trimitere
      if (pending) continue;
      if (await applyRecord(db, s, rec)) applied++;
    }
    cursor = batch[batch.length - 1].server_ts ?? cursor;
    await setSetting(db, CLOUD.cursor, cursor ?? '');
    if (batch.length < 500) break;
  }
  return applied;
}

async function applyRecord(db: SQLiteDatabase, s: Session, rec: CloudRecord): Promise<boolean> {
  switch (rec.kind) {
    case 'reading':
      return applyReading(db, s, rec);
    case 'assoc': {
      if (rec.deleted) {
        await db.runAsync('DELETE FROM association_payments WHERE month = ?', rec.uid);
        return true;
      }
      const d = rec.data as { amount: number; due_date: string | null; paid_at: string | null; note: string | null };
      await db.runAsync(
        `INSERT INTO association_payments (month, amount, due_date, paid_at, note) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET amount = excluded.amount, due_date = excluded.due_date,
           paid_at = excluded.paid_at, note = excluded.note`,
        rec.uid,
        d.amount,
        d.due_date,
        d.paid_at,
        d.note,
      );
      return true;
    }
    case 'setting': {
      if (!SHARED_SETTINGS.includes(rec.uid)) return false;
      // Scriem direct, ca să nu punem setarea înapoi în coadă
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        rec.uid,
        rec.deleted ? '' : String((rec.data as { value: string }).value),
      );
      return true;
    }
    case 'credentials': {
      const provider = rec.uid as (typeof PROVIDERS)[number];
      if (!PROVIDERS.includes(provider)) return false;
      if (rec.deleted) {
        await clearAccount(provider);
        return true;
      }
      const key = await familyKey();
      if (!key) return false;
      let creds: Credentials;
      try {
        creds = decryptJson<Credentials>(key, (rec.data as { enc: string }).enc);
      } catch {
        return false;
      }
      const had = await getCredentials(provider);
      if (had && had.email === creds.email && had.password === creds.password) return false;
      await saveCredentials(provider, creds);
      // Telefon nou al familiei: ia datele furnizorilor din cloud, nu se loghează singur (evită 2FA)
      if (!had && (await getSetting(db, DEVICE.providerSync)) === null) await setSetting(db, DEVICE.providerSync, '0');
      return true;
    }
    default:
      return false;
  }
}

interface ReadingData {
  meter_id: string;
  meter: Pick<Meter, 'name' | 'kind' | 'provider' | 'unit' | 'sort_order'> | null;
  value: number;
  read_at: string;
  source: Reading['source'];
  sent_at: string | null;
  note: string | null;
  photo: string | null;
}

async function applyReading(db: SQLiteDatabase, s: Session, rec: CloudRecord): Promise<boolean> {
  const local = await db.getFirstAsync<{ id: number; photo_uri: string | null; photo_remote: string | null }>(
    'SELECT id, photo_uri, photo_remote FROM readings WHERE uid = ?',
    rec.uid,
  );
  if (rec.deleted) {
    if (!local) return false;
    await db.runAsync('DELETE FROM readings WHERE id = ?', local.id);
    deletePhoto(local.photo_uri);
    return true;
  }
  const d = rec.data as ReadingData;

  // Contorul trebuie să existe (cheie străină); dacă nu-l avem încă, îl creăm din datele citirii
  if (d.meter) {
    await db.runAsync(
      `INSERT OR IGNORE INTO meters (id, name, kind, provider, unit, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      d.meter_id,
      d.meter.name,
      d.meter.kind,
      d.meter.provider,
      d.meter.unit,
      d.meter.sort_order,
      d.meter.provider === 'deservcom' ? 1 : 0,
    );
  }
  if (!(await db.getFirstAsync('SELECT 1 FROM meters WHERE id = ?', d.meter_id))) return false;

  let photoUri = local?.photo_uri ?? null;
  let photoRemote = local?.photo_remote ?? null;
  if (d.photo && d.photo !== local?.photo_remote) {
    const downloaded = await downloadPhoto(s, d.photo, rec.uid);
    if (downloaded) {
      if (local?.photo_uri && local.photo_uri !== downloaded) deletePhoto(local.photo_uri);
      photoUri = downloaded;
      photoRemote = d.photo;
    }
  } else if (!d.photo && local?.photo_uri) {
    deletePhoto(local.photo_uri);
    photoUri = null;
    photoRemote = null;
  }

  if (local) {
    await db.runAsync(
      `UPDATE readings SET meter_id = ?, value = ?, read_at = ?, source = ?, sent_at = ?, note = ?, photo_uri = ?, photo_remote = ?
       WHERE id = ?`,
      d.meter_id,
      d.value,
      d.read_at,
      d.source,
      d.sent_at,
      d.note,
      photoUri,
      photoRemote,
      local.id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO readings (meter_id, value, read_at, source, sent_at, note, photo_uri, photo_remote, uid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.meter_id,
      d.value,
      d.read_at,
      d.source,
      d.sent_at,
      d.note,
      photoUri,
      photoRemote,
      rec.uid,
    );
  }
  return true;
}

/**
 * Telefoanele care nu vorbesc cu furnizorii iau datele E.ON / Electrica din
 * cloud: la fiecare sincronizare verificăm dacă instantaneul e mai nou decât
 * cel aplicat. Merge și după ce comutatorul a fost oprit mai târziu.
 */
async function pullProviderSnapshot(db: SQLiteDatabase, s: Session): Promise<boolean> {
  if ((await getSetting(db, DEVICE.providerSync)) !== '0') return false;
  const rec = await fetchRecord(s, 'provider', 'snapshot');
  if (!rec || rec.deleted || !rec.data || !rec.server_ts) return false;
  if ((await getSetting(db, CLOUD.snapshotApplied)) === rec.server_ts) return false;
  await applyProviderSnapshot(db, rec.data as ProviderSnapshot);
  await setSetting(db, CLOUD.snapshotApplied, rec.server_ts);
  return true;
}

// ---------- Poze ----------

async function uploadPhoto(s: Session, localUri: string, uid: string): Promise<string | null> {
  if (!new File(localUri).exists) return null;
  const path = `${s.userId}/${uid}-${Date.now()}.jpg`;
  const res = await uploadAsync(storageUrl(path), localUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { ...storageHeaders(s), 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
  });
  if (res.status < 200 || res.status >= 300) throw new CloudError(`Poza nu s-a putut urca (${res.status})`, res.status);
  return path;
}

async function downloadPhoto(s: Session, path: string, uid: string): Promise<string | null> {
  const dir = new Directory(Paths.document, 'photos');
  dir.create({ idempotent: true });
  const dest = new File(dir, `cloud-${uid}-${Date.now()}.jpg`);
  try {
    const res = await downloadAsync(storageUrl(path, true), dest.uri, { headers: storageHeaders(s) });
    if (res.status >= 200 && res.status < 300) return dest.uri;
  } catch {
    // fără poză; citirea rămâne
  }
  deletePhoto(dest.uri);
  return null;
}

// ---------- Datele furnizorilor (E.ON / Electrica) ----------

interface ProviderSnapshot {
  meters: Meter[];
  status: Record<string, unknown>[];
  monthly: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  readings: Record<string, unknown>[];
  lastSync: string | null;
}

/** Telefonul care vorbește cu furnizorii trimite tot ce a aflat, la fiecare sincronizare nouă. */
async function queueProviderSnapshotIfNew(db: SQLiteDatabase): Promise<void> {
  if ((await getSetting(db, DEVICE.providerSync)) === '0') return;
  const last = await getSetting(db, PROVIDER_LAST_SYNC);
  if (!last || last === (await getSetting(db, CLOUD.snapshotOf))) return;
  const hasMeters = await db.getFirstAsync("SELECT 1 FROM meters WHERE provider != 'deservcom'");
  if (!hasMeters) return;
  await queueSync(db, 'provider', 'snapshot');
  await setSetting(db, CLOUD.snapshotOf, last);
}

async function buildProviderSnapshot(db: SQLiteDatabase): Promise<ProviderSnapshot> {
  return {
    meters: await db.getAllAsync<Meter>("SELECT id, name, kind, provider, unit, sort_order, active FROM meters WHERE provider != 'deservcom'"),
    status: await db.getAllAsync('SELECT * FROM provider_status'),
    monthly: await db.getAllAsync('SELECT * FROM provider_monthly'),
    invoices: await db.getAllAsync('SELECT * FROM provider_invoices'),
    payments: await db.getAllAsync('SELECT * FROM provider_payments'),
    readings: await db.getAllAsync("SELECT meter_id, value, read_at, source, note, uid FROM readings WHERE source != 'manual'"),
    lastSync: await getSetting(db, PROVIDER_LAST_SYNC),
  };
}

async function insertRows(db: SQLiteDatabase, table: string, rows: Record<string, unknown>[]): Promise<void> {
  for (const row of rows) {
    const cols = Object.keys(row);
    if (cols.length === 0) continue;
    await db.runAsync(
      `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      ...cols.map((c) => row[c] as string | number | null),
    );
  }
}

async function applyProviderSnapshot(db: SQLiteDatabase, snap: ProviderSnapshot): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const m of snap.meters) {
      await db.runAsync(
        `INSERT INTO meters (id, name, kind, provider, unit, sort_order, active) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, provider = excluded.provider,
           unit = excluded.unit, sort_order = excluded.sort_order, active = excluded.active`,
        m.id,
        m.name,
        m.kind,
        m.provider,
        m.unit,
        m.sort_order,
        m.active,
      );
    }
    const ids = snap.meters.map((m) => m.id);
    const ph = ids.map(() => '?').join(',') || "''";
    await db.runAsync(`UPDATE meters SET active = 0 WHERE provider != 'deservcom' AND id NOT IN (${ph})`, ...ids);
    await db.execAsync(`
      DELETE FROM provider_status;
      DELETE FROM provider_monthly;
      DELETE FROM provider_invoices;
      DELETE FROM provider_payments;
      DELETE FROM readings WHERE source != 'manual';
    `);
    await insertRows(db, 'provider_status', snap.status);
    await insertRows(db, 'provider_monthly', snap.monthly);
    await insertRows(db, 'provider_invoices', snap.invoices);
    await insertRows(db, 'provider_payments', snap.payments);
    await insertRows(db, 'readings', snap.readings);
    if (snap.lastSync) {
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        PROVIDER_LAST_SYNC,
        snap.lastSync,
      );
    }
  });
}

// ---------- Prima conectare ----------

/** Pune în coadă tot ce are telefonul, ca să ajungă în cloud la prima conectare. */
export async function queueEverything(db: SQLiteDatabase): Promise<void> {
  const readings = await db.getAllAsync<{ uid: string }>("SELECT uid FROM readings WHERE source = 'manual' AND uid IS NOT NULL");
  for (const r of readings) await queueSync(db, 'reading', r.uid);
  const months = await db.getAllAsync<{ month: string }>('SELECT month FROM association_payments');
  for (const m of months) await queueSync(db, 'assoc', m.month);
  for (const key of SHARED_SETTINGS) {
    const v = await getSetting(db, key);
    if (v !== null && v !== '') await queueSync(db, 'setting', key);
  }
  for (const p of PROVIDERS) {
    if (await getCredentials(p)) await queueSync(db, 'credentials', p);
  }
  // Instantaneul furnizorilor pleacă la prima sincronizare
  await setSetting(db, CLOUD.snapshotOf, '');
  await setSetting(db, CLOUD.snapshotApplied, '');
}

/** Deconectare: cloud-ul rămâne neatins; telefonul începe de la zero la reconectare. */
export async function resetCloudState(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox');
  await setSetting(db, CLOUD.cursor, '');
  await setSetting(db, CLOUD.lastSync, '');
  await setSetting(db, CLOUD.error, '');
  await setSetting(db, CLOUD.snapshotOf, '');
  await setSetting(db, CLOUD.snapshotApplied, '');
}
