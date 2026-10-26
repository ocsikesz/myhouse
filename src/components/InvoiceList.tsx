import { StyleSheet, Text, View } from 'react-native';

import type { ProviderInvoice, ProviderPayment } from '@/db/types';
import { daysBetween, formatDate, formatLei } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { invoiceState } from '@/lib/yearStats';

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];

function label(inv: ProviderInvoice): string {
  const d = inv.issue_date ?? inv.due_date;
  if (!d) return `Factura ${inv.invoice_number}`;
  const m = LUNI[Number(d.slice(5, 7)) - 1];
  return `Factura din ${m}`;
}

export function InvoiceList({ invoices, today }: { invoices: ProviderInvoice[]; today: string }) {
  const t = useTheme();
  if (invoices.length === 0) {
    return <Text style={{ color: t.textMuted }}>Nicio factură în perioada asta.</Text>;
  }
  return (
    <View>
      {invoices.map((inv, i) => {
        const state = invoiceState(inv, today);
        const days = inv.due_date ? daysBetween(today, inv.due_date) : null;
        const statusText =
          state === 'paid'
            ? 'Plătită'
            : state === 'overdue'
              ? `Restantă de ${-(days ?? 0)} ${days === -1 ? 'zi' : 'zile'}`
              : days === 0
                ? 'Scadentă azi'
                : days !== null
                  ? `De plată până pe ${formatDate(inv.due_date!)}`
                  : 'De plată';
        const color = state === 'paid' ? t.success : state === 'overdue' ? t.danger : t.warning;
        return (
          <View
            key={inv.invoice_number}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
          >
            <View style={[styles.marker, { backgroundColor: color }]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, { color: t.text }]}>{label(inv)}</Text>
              <Text style={[styles.meta, { color }]}>{statusText}</Text>
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
});
