import type { SQLiteDatabase } from 'expo-sqlite';

import type { AssociationPayment, Meter, Provider, ProviderStatus, Reading, ReadingSource } from './types';

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
    `INSERT INTO readings (meter_id, value, read_at, source, photo_uri, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    r.meterId,
    r.value,
    r.readAt,
    r.source ?? 'manual',
    r.photoUri ?? null,
    r.note ?? null,
  );
  return res.lastInsertRowId;
}

export async function markReadingSent(db: SQLiteDatabase, id: number, sentAt: string): Promise<void> {
  await db.runAsync('UPDATE readings SET sent_at = ? WHERE id = ?', sentAt, id);
}

export async function deleteReading(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM readings WHERE id = ?', id);
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
}

export async function setAssociationPaid(
  db: SQLiteDatabase,
  month: string,
  paidAt: string | null,
): Promise<void> {
  await db.runAsync('UPDATE association_payments SET paid_at = ? WHERE month = ?', paidAt, month);
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
}
