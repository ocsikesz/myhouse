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

export interface AssociationPayment {
  id: number;
  /** Luna, format YYYY-MM */
  month: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  note: string | null;
}
