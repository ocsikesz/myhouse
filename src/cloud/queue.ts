import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Legătura dintre repository și sincronizare, fără import circular:
 * repo anunță aici că a pus ceva în coadă, iar sincronizarea (înregistrată
 * la pornire) decide când trimite.
 */
type Handler = (db: SQLiteDatabase) => void;

let handler: Handler | null = null;
const listeners = new Set<() => void>();

export function setQueueHandler(h: Handler | null): void {
  handler = h;
}

export function onQueued(db: SQLiteDatabase): void {
  handler?.(db);
}

/** Ecranele se abonează ca să se reîncarce după ce au venit date din cloud. */
export function subscribeCloudChanges(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitCloudChanges(): void {
  for (const fn of listeners) fn();
}
