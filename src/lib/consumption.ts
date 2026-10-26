import type { Reading } from '@/db/types';

export interface ConsumptionPoint {
  /** Citirea curentă */
  reading: Reading;
  /** Consumul față de citirea anterioară; null pentru prima citire */
  delta: number | null;
}

/**
 * Primește citirile în ordine descrescătoare după dată (cum vin din repo)
 * și calculează consumul dintre citiri consecutive.
 */
export function withConsumption(readingsDesc: Reading[]): ConsumptionPoint[] {
  return readingsDesc.map((reading, i) => {
    const previous = readingsDesc[i + 1];
    return {
      reading,
      delta: previous ? round(reading.value - previous.value, 3) : null,
    };
  });
}

export type ReadingCheck =
  | { ok: true }
  | { ok: false; reason: 'mai_mic'; previous: number }
  | { ok: false; reason: 'salt_mare'; previous: number; delta: number; typical: number };

/**
 * Verifică un index nou față de istoric:
 * - nu poate fi mai mic decât ultimul index;
 * - avertizează dacă saltul e de peste 3× consumul mediu (probabil greșeală de tastare).
 */
export function checkNewReading(value: number, readingsDesc: Reading[]): ReadingCheck {
  const last = readingsDesc[0];
  if (!last) return { ok: true };
  if (value < last.value) return { ok: false, reason: 'mai_mic', previous: last.value };

  const deltas = withConsumption(readingsDesc)
    .map((p) => p.delta)
    .filter((d): d is number => d !== null && d > 0);
  if (deltas.length < 2) return { ok: true };

  const typical = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const delta = value - last.value;
  if (delta > typical * 3) {
    return { ok: false, reason: 'salt_mare', previous: last.value, delta: round(delta, 3), typical: round(typical, 3) };
  }
  return { ok: true };
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
