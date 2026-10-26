export type MeterKind = 'apa' | 'electricitate' | 'gaz';
export type Provider = 'deservcom' | 'eon' | 'electrica';
export type ReadingSource = 'manual' | 'eon' | 'electrica';

export interface Meter {
  id: string;
  name: string;
  kind: MeterKind;
  provider: Provider;
  unit: string;
  sort_order: number;
  active: number;
}

export interface Reading {
  id: number;
  meter_id: string;
  value: number;
  /** Data citirii, format YYYY-MM-DD */
  read_at: string;
  source: ReadingSource;
  photo_uri: string | null;
  /** Când a fost trimis furnizorului (ISO), null dacă nu a fost trimis */
  sent_at: string | null;
  note: string | null;
}

/** Starea unui contor de furnizor (E.ON / Electrica), din ultima sincronizare. */
export interface ProviderStatus {
  meter_id: string;
  /** accountContract (E.ON) sau NLC (Electrica) */
  external_id: string;
  address: string | null;
  /** Fereastra de autocitire, YYYY-MM-DD */
  window_start: string | null;
  window_end: string | null;
  in_window: number;
  last_index: number | null;
  last_index_date: string | null;
  last_index_type: string | null;
  /** Index trimis în fereastra curentă (de aplicație sau găsit la furnizor) */
  submitted_index: number | null;
  submitted_at: string | null;
  /** JSON cu datele necesare trimiterii (ablbelnr / serie contor + registru) */
  submit_info: string | null;
  fetched_at: string | null;
  error: string | null;
}

export interface AssociationPayment {
  id: number;
  /** Luna, format YYYY-MM */
  month: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  note: string | null;
}
