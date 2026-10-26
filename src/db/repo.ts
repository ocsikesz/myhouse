import type { SQLiteDatabase } from 'expo-sqlite';

import type { AssociationPayment, Meter, Reading, ReadingSource } from './types';

// ---------- Contoare ----------

export function listMeters(db: SQLiteDatabase): Promise<Meter[]> {
  return db.getAllAsync<Meter>(
    'SELECT * FROM meters WHERE active = 1 ORDER BY sort_order, name',
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
