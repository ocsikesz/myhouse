import { StyleSheet, Text, View } from 'react-native';

import type { ProviderInvoice, ProviderPayment } from '@/db/types';
import { daysBetween, formatDate, formatLei } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { formatNumber } from '@/lib/format';
import { invoiceState, type InvoiceIndex } from '@/lib/yearStats';

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];

function label(inv: ProviderInvoice): string {
  const d = inv.issue_date ?? inv.due_date;
  if (!d) return `Factura ${inv.invoice_number}`;
  const m = LUNI[Number(d.slice(5, 7)) - 1];
  return `${inv.amount < 0 ? 'Regularizare' : 'Factura'} din ${m}`;
}

export function InvoiceList({
  invoices,
  today,
  indexOf,
  unit,
}: {
  invoices: ProviderInvoice[];
  today: string;
  /** Diferența de index pe care se bazează factura (dacă se știe) */
  indexOf?: (inv: ProviderInvoice) => InvoiceIndex | null;
  unit?: string;
}) {
  const t = useTheme();
  if (invoices.length === 0) {
    return <Text style={{ color: t.textMuted }}>Nicio factură în perioada asta.</Text>;
  }
  return (
    <View>
      {invoices.map((inv, i) => {
        const state = invoiceState(inv, today);
        const days = inv.due_date ? daysBetween(today, inv.due_date) : null;
        const credit = inv.amount < 0;
        const statusText = credit
          ? 'Credit în favoarea ta (se scade din facturile următoare)'
          : state === 'paid'
            ? 'Plătită'
            : state === 'overdue'
              ? `Restantă de ${-(days ?? 0)} ${days === -1 ? 'zi' : 'zile'}`
              : days === 0
                ? 'Scadentă azi'
                : days !== null
                  ? `De plată până pe ${formatDate(inv.due_date!)}`
                  : 'De plată';
        const color = credit || state === 'paid' ? t.success : state === 'overdue' ? t.danger : t.warning;
        const idx = indexOf?.(inv) ?? null;
        return (
          <View
            key={inv.invoice_number}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
          >
            <View style={[styles.marker, { backgroundColor: color }]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, { color: t.text }]}>{label(inv)}</Text>
              <Text style={[styles.meta, { color }]}>{statusText}</Text>
              {idx ? (
                <Text style={[styles.meta, { color: t.textMuted }]}>
                  Index {formatNumber(idx.to - idx.delta, 0)} → {formatNumber(idx.to, 0)}
                  {idx.estimated ? ' · estimat' : ''}
                  {idx.months > 1 ? ` · ${idx.months} luni` : ''}
                </Text>
              ) : null}
              {inv.issue_date ? (
                <Text style={[styles.meta, { color: t.textMuted }]}>
                  Emisă {formatDate(inv.issue_date)}, nr. {inv.invoice_number}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.amount, { color: t.text }]}>{formatLei(inv.amount)}</Text>
              {state !== 'paid' && inv.unpaid < inv.amount - 0.009 ? (
                <Text style={[styles.meta, { color }]}>rest {formatLei(inv.unpaid)}</Text>
              ) : null}
              {idx ? (
                <Text style={[styles.delta, { color: idx.delta < 0 ? t.success : idx.estimated ? t.warning : t.text }]}>
                  {idx.delta > 0 ? '+' : ''}
                  {formatNumber(idx.delta, 0)} {unit ?? ''}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function PaymentList({ payments }: { payments: ProviderPayment[] }) {
  const t = useTheme();
  if (payments.length === 0) return <Text style={{ color: t.textMuted }}>Nicio plată înregistrată.</Text>;
  return (
    <View>
      {payments.map((p, i) => (
        <View
          key={`${p.paid_on}-${p.amount}-${i}`}
          style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
        >
          <View style={[styles.marker, { backgroundColor: t.success }]} />
          <Text style={[styles.title, { color: t.text, flex: 1 }]}>Plată {formatDate(p.paid_on)}</Text>
          <Text style={[styles.amount, { color: t.text }]}>{formatLei(p.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  marker: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13 },
  amount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  delta: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 2 },
});
