import type { SQLiteDatabase } from 'expo-sqlite';

import { onQueued } from '@/cloud/queue';
import { SHARED_SETTINGS } from '@/lib/settingsKeys';

import type {
  AssociationPayment,
  Meter,
  Provider,
  ProviderInvoice,
  ProviderMonthly,
  ProviderPayment,
  ProviderStatus,
  Reading,
  ReadingSource,
} from './types';

// ---------- Coada de sincronizare ----------

export type SyncKind = 'reading' | 'assoc' | 'setting' | 'credentials' | 'provider';

/** Marchează o înregistrare ca schimbată; sincronizarea o trimite în cloud. */
export async function queueSync(db: SQLiteDatabase, kind: SyncKind, uid: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_outbox (kind, uid) VALUES (?, ?)
     ON CONFLICT(kind, uid) DO UPDATE SET queued_at = datetime('now')`,
    kind,
    uid,
  );
  onQueued(db);
}

/** Citirile manuale (apă, index trimis din aplicație) sunt ale familiei; cele de la furnizor vin în instantaneul furnizorilor. */
async function queueReading(db: SQLiteDatabase, id: number): Promise<void> {
  const r = await db.getFirstAsync<{ uid: string | null; source: string }>('SELECT uid, source FROM readings WHERE id = ?', id);
  if (r?.uid && r.source === 'manual') await queueSync(db, 'reading', r.uid);
}

function newUid(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

// ---------- Contoare ----------

export function listMeters(db: SQLiteDatabase): Promise<Meter[]> {
  return db.getAllAsync<Meter>(
    'SELECT * FROM meters WHERE active = 1 ORDER BY sort_order, name',
  );
}

export async function upsertMeter(
  db: SQLiteDatabase,
  m: Pick<Meter, 'id' | 'name' | 'kind' | 'provider' | 'unit' | 'sort_order'>,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO meters (id, name, kind, provider, unit, sort_order, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, kind = excluded.kind, unit = excluded.unit, active = 1`,
    m.id,
    m.name,
    m.kind,
    m.provider,
    m.unit,
    m.sort_order,
  );
}

/** Dezactivează contoarele furnizorului care nu mai apar în cont (istoricul rămâne). */
export async function deactivateMissingMeters(db: SQLiteDatabase, provider: Provider, keepIds: string[]): Promise<void> {
  const placeholders = keepIds.map(() => '?').join(',') || "''";
  await db.runAsync(
    `UPDATE meters SET active = 0 WHERE provider = ? AND id NOT IN (${placeholders})`,
    provider,
    ...keepIds,
  );
}

export async function deactivateProvider(db: SQLiteDatabase, provider: Provider): Promise<void> {
  await db.runAsync('UPDATE meters SET active = 0 WHERE provider = ?', provider);
}

export async function getMeter(db: SQLiteDatabase, id: string): Promise<Meter | null> {
  return db.getFirstAsync<Meter>('SELECT * FROM meters WHERE id = ?', id);
}

// ---------- Stare furnizori ----------

export function getProviderStatus(db: SQLiteDatabase, meterId: string): Promise<ProviderStatus | null> {
  return db.getFirstAsync<ProviderStatus>('SELECT * FROM provider_status WHERE meter_id = ?', meterId);
}

export function listProviderStatuses(db: SQLiteDatabase): Promise<(ProviderStatus & { name: string; kind: Meter['kind']; unit: string; provider: Provider })[]> {
  return db.getAllAsync(
    `SELECT ps.*, m.name, m.kind, m.unit, m.provider
     FROM provider_status ps JOIN meters m ON m.id = ps.meter_id
     WHERE m.active = 1 ORDER BY m.sort_order, m.name`,
  );
}

export async function saveProviderStatus(db: SQLiteDatabase, s: ProviderStatus): Promise<void> {
  await db.runAsync(
    `INSERT INTO provider_status (meter_id, external_id, address, window_start, window_end, in_window,
       last_index, last_index_date, last_index_type, submitted_index, submitted_at, submit_info, fetched_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(meter_id) DO UPDATE SET
       external_id = excluded.external_id, address = excluded.address,
       window_start = excluded.window_start, window_end = excluded.window_end, in_window = excluded.in_window,
       last_index = excluded.last_index, last_index_date = excluded.last_index_date,
       last_index_type = excluded.last_index_type, submitted_index = excluded.submitted_index,
       submitted_at = excluded.submitted_at, submit_info = excluded.submit_info,
       fetched_at = excluded.fetched_at, error = excluded.error`,
    s.meter_id,
    s.external_id,
    s.address,
    s.window_start,
    s.window_end,
    s.in_window,
    s.last_index,
    s.last_index_date,
    s.last_index_type,
    s.submitted_index,
    s.submitted_at,
    s.submit_info,
    s.fetched_at,
    s.error,
  );
}

export async function setProviderStatusError(db: SQLiteDatabase, provider: Provider, error: string | null): Promise<void> {
  await db.runAsync(
    `UPDATE provider_status SET error = ?
     WHERE meter_id IN (SELECT id FROM meters WHERE provider = ?)`,
    error,
    provider,
  );
}

// ---------- Istoric furnizori ----------

/** Înlocuiește datele lunare primite de la furnizor (păstrează lunile pe care nu le-a trimis). */
export async function saveProviderMonthly(db: SQLiteDatabase, rows: ProviderMonthly[]): Promise<void> {
  for (const r of rows) {
    await db.runAsync(
      `INSERT INTO provider_monthly (meter_id, month, consumption, index_value, reading_type)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(meter_id, month) DO UPDATE SET
         consumption = COALESCE(excluded.consumption, provider_monthly.consumption),
         index_value = COALESCE(excluded.index_value, provider_monthly.index_value),
         reading_type = COALESCE(excluded.reading_type, provider_monthly.reading_type)`,
      r.meter_id,
      r.month,
      r.consumption,
      r.index_value,
      r.reading_type,
    );
  }
}

export function listProviderMonthly(db: SQLiteDatabase, meterId: string, fromMonth: string): Promise<ProviderMonthly[]> {
  return db.getAllAsync<ProviderMonthly>(
    'SELECT * FROM provider_monthly WHERE meter_id = ? AND month >= ? ORDER BY month',
    meterId,
    fromMonth,
  );
}

/**
 * Salvează facturile. Dacă `complete` e true, lista e completă (toate facturile
 * din perioadă) și facturile care nu mai apar ca neplătite sunt marcate plătite.
 */
export async function saveProviderInvoices(
  db: SQLiteDatabase,
  meterId: string,
  invoices: Omit<ProviderInvoice, 'meter_id'>[],
  complete: boolean,
): Promise<void> {
  if (!complete) {
    // Avem doar facturile neplătite: tot ce era neplătit și nu mai apare a fost plătit
    const numbers = invoices.map((i) => i.invoice_number);
    const ph = numbers.map(() => '?').join(',') || "''";
    await db.runAsync(
      `UPDATE provider_invoices SET paid = 1, unpaid = 0
       WHERE meter_id = ? AND paid = 0 AND invoice_number NOT IN (${ph})`,
      meterId,
      ...numbers,
    );
  }
  for (const i of invoices) {
    await db.runAsync(
      `INSERT INTO provider_invoices (meter_id, invoice_number, issue_date, due_date, amount, unpaid, paid)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(meter_id, invoice_number) DO UPDATE SET
         issue_date = COALESCE(excluded.issue_date, provider_invoices.issue_date),
         due_date = COALESCE(excluded.due_date, provider_invoices.due_date),
         amount = excluded.amount, unpaid = excluded.unpaid, paid = excluded.paid`,
      meterId,
      i.invoice_number,
      i.issue_date,
      i.due_date,
      i.amount,
      i.unpaid,
      i.paid,
    );
  }
}

export function listProviderInvoices(db: SQLiteDatabase, meterId: string, fromDate: string): Promise<ProviderInvoice[]> {
  return db.getAllAsync<ProviderInvoice>(
    `SELECT * FROM provider_invoices
     WHERE meter_id = ? AND (paid = 0 OR COALESCE(issue_date, due_date, '9999') >= ?)
     ORDER BY COALESCE(issue_date, due_date) DESC`,
    meterId,
    fromDate,
  );
}

export function listUnpaidInvoices(db: SQLiteDatabase): Promise<(ProviderInvoice & { name: string; provider: Provider })[]> {
  return db.getAllAsync(
    `SELECT i.*, m.name, m.provider FROM provider_invoices i JOIN meters m ON m.id = i.meter_id
     WHERE i.paid = 0 AND i.unpaid > 0 AND m.active = 1 ORDER BY i.due_date`,
  );
}

export async function saveProviderPayments(db: SQLiteDatabase, rows: ProviderPayment[]): Promise<void> {
  for (const p of rows) {
    await db.runAsync(
      `INSERT OR IGNORE INTO provider_payments (meter_id, paid_on, amount, reference) VALUES (?, ?, ?, ?)`,
      p.meter_id,
      p.paid_on,
      p.amount,
      p.reference,
    );
  }
}

export function listProviderPayments(db: SQLiteDatabase, meterId: string, fromDate: string): Promise<ProviderPayment[]> {
  return db.getAllAsync<ProviderPayment>(
    'SELECT * FROM provider_payments WHERE meter_id = ? AND paid_on >= ? ORDER BY paid_on DESC',
    meterId,
    fromDate,
  );
}

// ---------- Citiri ----------

export function listReadings(db: SQLiteDatabase, meterId: string, limit = 24): Promise<Reading[]> {
  return db.getAllAsync<Reading>(
    'SELECT * FROM readings WHERE meter_id = ? ORDER BY read_at DESC, id DESC LIMIT ?',
    meterId,
    limit,
  );
}

export async function latestReading(db: SQLiteDatabase, meterId: string): Promise<Reading | null> {
  return db.getFirstAsync<Reading>(
    'SELECT * FROM readings WHERE meter_id = ? ORDER BY read_at DESC, id DESC LIMIT 1',
    meterId,
  );
}

export interface NewReading {
  meterId: string;
  value: number;
  readAt: string;
  source?: ReadingSource;
  photoUri?: string | null;
  note?: string | null;
}

export async function addReading(db: SQLiteDatabase, r: NewReading): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO readings (meter_id, value, read_at, source, photo_uri, note, uid)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    r.meterId,
    r.value,
    r.readAt,
    r.source ?? 'manual',
    r.photoUri ?? null,
    r.note ?? null,
    newUid(),
  );
  await queueReading(db, res.lastInsertRowId);
  return res.lastInsertRowId;
}

export async function markReadingSent(db: SQLiteDatabase, id: number, sentAt: string): Promise<void> {
  await db.runAsync('UPDATE readings SET sent_at = ? WHERE id = ?', sentAt, id);
  await queueReading(db, id);
}

export async function deleteReading(db: SQLiteDatabase, id: number): Promise<void> {
  const r = await db.getFirstAsync<{ uid: string | null; source: string }>('SELECT uid, source FROM readings WHERE id = ?', id);
  await db.runAsync('DELETE FROM readings WHERE id = ?', id);
  // Rândul nu mai există: sincronizarea trimite ștergerea
  if (r?.uid && r.source === 'manual') await queueSync(db, 'reading', r.uid);
}

/** Atașează, înlocuiește sau (cu null) scoate poza unei citiri. */
export async function setReadingPhoto(db: SQLiteDatabase, id: number, photoUri: string | null): Promise<void> {
  // Poza nouă trebuie urcată din nou în cloud
  await db.runAsync('UPDATE readings SET photo_uri = ?, photo_remote = NULL WHERE id = ?', photoUri, id);
  await queueReading(db, id);
}

// ---------- Asociația de proprietari ----------

export function listAssociationPayments(db: SQLiteDatabase, limit = 24): Promise<AssociationPayment[]> {
  return db.getAllAsync<AssociationPayment>(
    'SELECT * FROM association_payments ORDER BY month DESC LIMIT ?',
    limit,
  );
}

export async function upsertAssociationPayment(
  db: SQLiteDatabase,
  p: { month: string; amount: number; dueDate?: string | null; note?: string | null },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO association_payments (month, amount, due_date, note)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(month) DO UPDATE SET
       amount = excluded.amount,
       due_date = excluded.due_date,
       note = excluded.note`,
    p.month,
    p.amount,
    p.dueDate ?? null,
    p.note ?? null,
  );
  await queueSync(db, 'assoc', p.month);
}

export async function setAssociationPaid(
  db: SQLiteDatabase,
  month: string,
  paidAt: string | null,
): Promise<void> {
  await db.runAsync('UPDATE association_payments SET paid_at = ? WHERE month = ?', paidAt, month);
  await queueSync(db, 'assoc', month);
}

export async function deleteAssociationPayment(db: SQLiteDatabase, month: string): Promise<void> {
  await db.runAsync('DELETE FROM association_payments WHERE month = ?', month);
  await queueSync(db, 'assoc', month);
}

// ---------- Setări ----------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
  if (SHARED_SETTINGS.includes(key)) await queueSync(db, 'setting', key);
}
