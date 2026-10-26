import { recognizeText } from 'casamea-native';

import type { Reading } from '@/db/types';

import { findMeterCandidates, type Candidate, type MeterExpectation } from './meterOcr';
import { takeMeterPhoto } from './photos';

export interface ScanResult {
  photoUri: string;
  candidates: Candidate[];
  /** Mesaj dacă recunoașterea nu a mers (poza rămâne) */
  error: string | null;
}

/** Ce așteptăm pe cadran, din istoricul contorului. */
export function expectationFrom(history: Reading[], maxDecimals: number, previousOverride?: number | null): MeterExpectation {
  const desc = [...history].sort((a, b) => (a.read_at < b.read_at ? 1 : a.read_at > b.read_at ? -1 : b.id - a.id));
  const deltas: number[] = [];
  for (let i = 0; i + 1 < desc.length; i++) {
    const d = desc[i].value - desc[i + 1].value;
    if (d > 0) deltas.push(d);
  }
  const prev = Math.max(previousOverride ?? -Infinity, desc[0]?.value ?? -Infinity);
  return {
    previous: Number.isFinite(prev) ? prev : null,
    typicalDelta: deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null,
    maxDecimals,
  };
}

/** Face poza (cu decupare) și citește indexul. null dacă utilizatorul a renunțat. */
export async function scanMeter(prefix: string, expectation: MeterExpectation): Promise<ScanResult | null> {
  // Poză întreagă (fără decupare): o trimiți și ca dovadă; OCR-ul alege singur cifrele mari
  const photoUri = await takeMeterPhoto(prefix, false);
  if (!photoUri) return null;
  try {
    const ocr = await recognizeText(photoUri);
    const candidates = findMeterCandidates(ocr, expectation);
    return {
      photoUri,
      candidates,
      error: candidates.length ? null : 'N-am găsit cifrele pe poză. Încearcă mai aproape, cu doar cadranul în cadru, sau scrie indexul de mână.',
    };
  } catch (e) {
    return { photoUri, candidates: [], error: e instanceof Error ? e.message : String(e) };
  }
}
