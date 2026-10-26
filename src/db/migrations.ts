import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migrații secvențiale. Fiecare element din listă ridică `PRAGMA user_version`
 * cu 1. Nu modifica o migrație deja livrată — adaugă una nouă la final.
 */
const MIGRATIONS: ((db: SQLiteDatabase) => Promise<void>)[] = [
  // v1 — schema inițială
  async (db) => {
    await db.execAsync(`
      CREATE TABLE meters (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL,
        kind        TEXT NOT NULL CHECK (kind IN ('apa', 'electricitate', 'gaz')),
        provider    TEXT NOT NULL CHECK (provider IN ('deservcom', 'eon', 'electrica')),
        unit        TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE readings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        meter_id    TEXT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
        value       REAL NOT NULL,
        read_at     TEXT NOT NULL,
        source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'eon', 'electrica')),
        photo_uri   TEXT,
        sent_at     TEXT,
        note        TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_readings_meter_date ON readings (meter_id, read_at DESC);

      CREATE TABLE association_payments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        month       TEXT NOT NULL UNIQUE,
        amount      REAL NOT NULL,
        due_date    TEXT,
        paid_at     TEXT,
        note        TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      INSERT INTO meters (id, name, kind, provider, unit, sort_order) VALUES
        ('apa_bucatarie', 'Apă rece – bucătărie', 'apa', 'deservcom', 'm³', 10),
        ('apa_baie',      'Apă rece – baie',      'apa', 'deservcom', 'm³', 20);
    `);
  },
];

export const DB_NAME = 'casamea.db';
export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const migrate = MIGRATIONS[version];
    await db.withExclusiveTransactionAsync(async (txn) => {
      await migrate(txn);
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version += 1;
  }
}
