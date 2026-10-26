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

  // v2 — starea contoarelor sincronizate de la E.ON / Electrica
  async (db) => {
    await db.execAsync(`
      CREATE TABLE provider_status (
        meter_id         TEXT PRIMARY KEY NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
        external_id      TEXT NOT NULL,
        address          TEXT,
        window_start     TEXT,
        window_end       TEXT,
        in_window        INTEGER NOT NULL DEFAULT 0,
        last_index       REAL,
        last_index_date  TEXT,
        last_index_type  TEXT,
        submitted_index  REAL,
        submitted_at     TEXT,
        submit_info      TEXT,
        fetched_at       TEXT,
        error            TEXT
      );
    `);
  },

  // v3 — istoric anual de la furnizori: consum lunar, facturi, plăți
  async (db) => {
    await db.execAsync(`
      CREATE TABLE provider_monthly (
        meter_id     TEXT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
        month        TEXT NOT NULL,
        consumption  REAL,
        index_value  REAL,
        reading_type TEXT,
        PRIMARY KEY (meter_id, month)
      );

      CREATE TABLE provider_invoices (
        meter_id        TEXT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
        invoice_number  TEXT NOT NULL,
        issue_date      TEXT,
        due_date        TEXT,
        amount          REAL NOT NULL,
        unpaid          REAL NOT NULL DEFAULT 0,
        paid            INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (meter_id, invoice_number)
      );

      CREATE TABLE provider_payments (
        meter_id  TEXT NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
        paid_on   TEXT NOT NULL,
        amount    REAL NOT NULL,
        reference TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (meter_id, paid_on, amount, reference)
      );
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
