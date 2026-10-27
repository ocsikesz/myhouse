import { recognizeText } from 'casamea-native';

import type { Reading } from '@/db/types';

import { cropOcr, findMeterCandidates, mergeCandidates, type Candidate, type MeterExpectation, type Rect } from './meterOcr';

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

/**
 * Citește indexul de pe poză. Cu `region` (cadrul de încadrare, în fracții din
 * poză) se uită întâi doar acolo; dacă în cadru nu găsește cifre, ia toată poza.
 * Poza rămâne întreagă — o trimiți și ca dovadă.
 */
export async function readMeterPhoto(photoUri: string, expectation: MeterExpectation, region?: Rect): Promise<ScanResult> {
  try {
    // Două treceri: poza originală și o variantă alb-negru cu contrast mărit
    // (contoarele vechi, fotografiate în lumină slabă, ies mult mai bine așa).
    const passes = await Promise.allSettled([recognizeText(photoUri, false), recognizeText(photoUri, true)]);
    const results = passes.flatMap((p) => (p.status === 'fulfilled' ? [p.value] : []));
    if (results.length === 0) {
      const err = passes.find((p) => p.status === 'rejected') as PromiseRejectedResult | undefined;
      throw err?.reason ?? new Error('Recunoașterea textului a eșuat');
    }
    const found: Candidate[][] = [];
    for (const ocr of results) {
      let c: Candidate[] = [];
      // Cadrul e calculat pentru o poză în picioare; dacă poza a ieșit culcată, îl ignorăm
      if (region && ocr.height >= ocr.width) c = findMeterCandidates(cropOcr(ocr, ocr.width, ocr.height, region), expectation);
      if (c.length === 0) c = findMeterCandidates(ocr, expectation);
      found.push(c);
    }
    const candidates = mergeCandidates(found);
    return {
      photoUri,
      candidates,
      error: candidates.length
        ? null
        : 'N-am găsit cifrele pe poză. Încadrează doar indexul în dreptunghi, mai aproape și cu lanterna pornită, sau scrie-l de mână.',
    };
  } catch (e) {
    return { photoUri, candidates: [], error: e instanceof Error ? e.message : String(e) };
  }
}
