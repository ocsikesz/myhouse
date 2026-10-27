/**
 * Cel mai recent index cunoscut al unui contor de furnizor: cel trimis de noi
 * la autocitire, dacă e mai nou decât ultimul index facturat; altfel cel facturat.
 * Funcție pură.
 */
export interface CurrentIndex {
  value: number | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** 'trimis' = autocitirea noastră, încă nefacturată */
  source: 'trimis' | 'facturat' | null;
  /** Ultimul index facturat, când afișăm unul trimis mai nou */
  billed: { value: number; date: string | null } | null;
}

export function currentIndex(s: {
  last_index: number | null;
  last_index_date: string | null;
  submitted_index: number | null;
  submitted_at: string | null;
}): CurrentIndex {
  const submittedDate = s.submitted_at ? s.submitted_at.slice(0, 10) : null;
  const newer =
    s.submitted_index !== null &&
    (s.last_index === null ||
      (s.submitted_index > s.last_index && (!s.last_index_date || !submittedDate || submittedDate >= s.last_index_date)));
  if (newer) {
    return {
      value: s.submitted_index,
      date: submittedDate,
      source: 'trimis',
      billed: s.last_index !== null ? { value: s.last_index, date: s.last_index_date } : null,
    };
  }
  return {
    value: s.last_index,
    date: s.last_index_date,
    source: s.last_index !== null ? 'facturat' : null,
    billed: null,
  };
}
