/**
 * Alege indexul contorului din textul recunoscut pe poză. Funcții pure, testate.
 *
 * Pe o poză de contor apar multe numere: seria, anul, Qn, imp/kWh, tensiunea.
 * Indexul se recunoaște prin: cifre mari (tamburii sunt cel mai mare text),
 * 4–8 cifre, și — cel mai important — o valoare puțin peste indexul anterior.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OcrInput {
  lines: { text: string; frame: Rect; elements: { text: string; frame: Rect }[] }[];
}

export interface MeterExpectation {
  /** Ultimul index cunoscut */
  previous: number | null;
  /** Consumul tipic dintre două citiri (aceeași unitate) */
  typicalDelta: number | null;
  /** Câte zecimale poate avea indexul pe cadran (apă/gaz: tamburii roșii) */
  maxDecimals: number;
}

export interface Candidate {
  value: number;
  /** Cifrele așa cum au fost citite */
  raw: string;
  score: number;
}

/** Litere pe care OCR-ul le confundă des cu cifre pe tamburi. */
const LOOKALIKE: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0', U: '0',
  I: '1', l: '1', '|': '1', i: '1', '!': '1', L: '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  G: '6', b: '6',
  T: '7',
  B: '8',
  g: '9', q: '9',
};

/** Cuvinte care arată că numărul de pe rând NU e indexul. */
const NOISE = /(qn|qmax|qmin|q3|q4|imp|kwh\/|\/kwh|rev|hz|\bv\b|\d\s*v\b|\bbar\b|kpa|\bdn\b|class|cl\.|nr\.?|no\.?|s\/n|serie|type|tip|pmax|°c|\bmid\b|\bce\b|\bg\d\b|\bmm\b)/i;

/** Normalizează un fragment: înlocuiește literele-sosie; null dacă nu e „aproape numeric”. */
export function normalizeDigits(text: string): string | null {
  const t = text.replace(/\s+/g, '');
  if (!t) return null;
  let digits = 0;
  let lookalikes = 0;
  let out = '';
  for (const ch of t) {
    if (/\d/.test(ch)) {
      digits++;
      out += ch;
    } else if (ch === ',' || ch === '.') {
      out += '.';
    } else if (LOOKALIKE[ch] !== undefined) {
      lookalikes++;
      out += LOOKALIKE[ch];
    } else {
      return null;
    }
  }
  // Măcar o cifră reală și nu mult mai multe litere decât cifre — altfel e un cuvânt
  if (digits === 0 || lookalikes > digits + 2) return null;
  return out;
}

interface Run {
  raw: string;
  height: number;
  noisyLine: boolean;
}

/** Grupuri de elemente numerice alăturate pe același rând (tamburii apar des ca cifre separate). */
export function extractRuns(input: OcrInput): Run[] {
  const runs: Run[] = [];
  for (const line of input.lines) {
    const noisyLine = NOISE.test(line.text);
    const els = [...line.elements].sort((a, b) => a.frame.left - b.frame.left);
    let cur: { raw: string; heights: number[]; right: number } | null = null;
    const flush = () => {
      if (cur && cur.raw.replace(/\./g, '').length >= 3) {
        const hs = [...cur.heights].sort((a, b) => a - b);
        runs.push({ raw: cur.raw, height: hs[Math.floor(hs.length / 2)], noisyLine });
      }
      cur = null;
    };
    for (const el of els) {
      const n = normalizeDigits(el.text);
      const h = el.frame.bottom - el.frame.top;
      if (n === null) {
        flush();
        continue;
      }
      const gap = cur ? el.frame.left - cur.right : 0;
      if (cur && gap <= h * 1.6) {
        cur.raw += n;
        cur.heights.push(h);
        cur.right = el.frame.right;
      } else {
        flush();
        cur = { raw: n, heights: [h], right: el.frame.right };
      }
    }
    flush();
  }
  return runs;
}

/** Interpretările posibile ale unui șir de cifre (zecimale citite ca cifre întregi). */
export function interpretations(raw: string, maxDecimals: number): { value: number; intDigits: number }[] {
  const parts = raw.split('.').filter(Boolean);
  if (parts.length === 2) {
    const v = Number(`${parts[0]}.${parts[1]}`);
    return Number.isFinite(v) ? [{ value: v, intDigits: parts[0].length }] : [];
  }
  const digits = raw.replace(/\./g, '');
  if (!/^\d+$/.test(digits)) return [];
  const out: { value: number; intDigits: number }[] = [];
  for (let k = 0; k <= Math.min(maxDecimals, digits.length - 1); k++) {
    const intPart = digits.slice(0, digits.length - k);
    const dec = digits.slice(digits.length - k);
    out.push({ value: Number(k ? `${intPart}.${dec}` : intPart), intDigits: intPart.length });
  }
  return out;
}

const intDigitsOf = (n: number) => String(Math.trunc(Math.abs(n))).length;

export function findMeterCandidates(input: OcrInput, exp: MeterExpectation, limit = 4): Candidate[] {
  const runs = extractRuns(input);
  if (runs.length === 0) return [];
  const maxHeight = Math.max(...runs.map((r) => r.height));
  const best = new Map<string, Candidate>();

  for (const run of runs) {
    const digitCount = run.raw.replace(/\./g, '').length;
    if (digitCount > 12) continue;
    for (const { value, intDigits } of interpretations(run.raw, exp.maxDecimals)) {
      let score = (run.height / maxHeight) * 40;
      if (run.noisyLine) score -= 25;
      // Ani (2019, 2024) apar des pe plăcuțe
      if (/^(19|20)\d\d$/.test(run.raw)) score -= 20;

      if (exp.previous !== null) {
        if (value < exp.previous) {
          score -= 60;
        } else {
          const delta = value - exp.previous;
          const typical = exp.typicalDelta && exp.typicalDelta > 0 ? exp.typicalDelta : Math.max(1, exp.previous * 0.02);
          if (delta <= typical * 4) score += 60;
          else if (delta <= typical * 15) score += 30;
          else score -= 30;
        }
        if (intDigits === intDigitsOf(exp.previous)) score += 10;
        else if (intDigits > intDigitsOf(exp.previous) + 1) score -= 15;
      } else {
        if (intDigits >= 4 && intDigits <= 6) score += 15;
        else if (intDigits > 8) score -= 20;
        // Fără istoric preferăm citirea fără zecimale inventate
        if (!run.raw.includes('.') && value !== Math.trunc(value)) score -= 5;
      }

      const key = String(value);
      const prev = best.get(key);
      if (!prev || prev.score < score) best.set(key, { value, raw: run.raw, score: Math.round(score) });
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
