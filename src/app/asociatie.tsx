import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Body, Button, Card, CardHeader, Field, IconButton, Row, Screen, SectionTitle } from '@/components/ui';
import { deleteAssociationPayment, getSetting, listAssociationPayments, setAssociationPaid, upsertAssociationPayment } from '@/db/repo';
import type { AssociationPayment } from '@/db/types';
import { confirm, info } from '@/lib/dialogs';
import {
  addMonths,
  currentMonth,
  formatDate,
  formatLei,
  formatMonth,
  parseDecimal,
  parseRoDate,
  previousMonth,
  todayIso,
} from '@/lib/format';
import { SETTINGS } from '@/lib/settingsKeys';
import { useTheme } from '@/lib/theme';
import { useDbQuery } from '@/lib/useDbQuery';

export default function AssociationScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  const [defaultDueDay, setDefaultDueDay] = useState<number | null>(null);
  const { data, reload } = useDbQuery(async (d) => {
    const n = Number(await getSetting(d, SETTINGS.assocDueDay));
    setDefaultDueDay(Number.isInteger(n) && n >= 1 && n <= 31 ? n : null);
    return listAssociationPayments(d, 36);
  });

  // La prima încărcare, precompletează luna curentă dacă există deja
  const initialized = useRef(false);
  useEffect(() => {
    if (data && !initialized.current) {
      initialized.current = true;
      loadMonth(thisMonth, data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function loadMonth(m: string, payments: AssociationPayment[]) {
    setMonth(m);
    const existing = payments.find((p) => p.month === m);
    setAmount(existing ? String(existing.amount).replace('.', ',') : '');
    setDue(existing?.due_date ? formatDate(existing.due_date) : defaultDue(m));
  }

  /** Scadența implicită din Setări pentru luna dată, ca ZZ.LL.AAAA */
  function defaultDue(m: string): string {
    if (!defaultDueDay) return '';
    const last = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
    return formatDate(`${m}-${String(Math.min(defaultDueDay, last)).padStart(2, '0')}`);
  }

  async function onSave() {
    const value = parseDecimal(amount);
    if (value === null) {
      info('Sumă invalidă', 'Introdu suma în lei, de ex. 412,50');
      return;
    }
    let dueIso: string | null = null;
    if (due.trim()) {
      dueIso = parseRoDate(due);
      if (!dueIso) {
        info('Dată invalidă', 'Scadența în formatul ZZ.LL.AAAA, de ex. 25.11.2026');
        return;
      }
    }
    setSaving(true);
    await upsertAssociationPayment(db, { month, amount: value, dueDate: dueIso });
    setSaving(false);
    reload();
  }

  async function onTogglePaid(p: AssociationPayment) {
    if (p.paid_at) {
      const ok = await confirm('Anulezi plata?', `${formatMonth(p.month)} va apărea din nou ca neplătit.`, 'Anulează plata', 'Înapoi');
      if (!ok) return;
      await setAssociationPaid(db, p.month, null);
    } else {
      await setAssociationPaid(db, p.month, todayIso());
    }
    reload();
  }

  async function onDelete(p: AssociationPayment) {
    const ok = await confirm('Ștergi luna?', `${formatMonth(p.month)}: ${formatLei(p.amount)}`, 'Șterge');
    if (!ok) return;
    await deleteAssociationPayment(db, p.month);
    // Dacă era luna din formular, golim câmpurile
    if (p.month === month) {
      setAmount('');
      setDue('');
    }
    reload();
  }

  const payments = data ?? [];
  const editing = payments.find((p) => p.month === month);
  const total12 = payments
    .filter((p) => p.month > addMonths(thisMonth, -12))
    .reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Asociația de proprietari' }} />
      <Screen>
        <Card>
          <CardHeader
            icon="office-building-outline"
            color={t.association}
            title="Consum lunar"
            subtitle={editing ? 'Luna e salvată, poți corecta suma.' : 'Introdu suma de pe lista de plată.'}
          />
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton icon="chevron-left" label="Luna anterioară" onPress={() => loadMonth(previousMonth(month), payments)} />
            <Text style={[styles.month, { color: t.text }]}>{formatMonth(month)}</Text>
            <IconButton
              icon="chevron-right"
              label="Luna următoare"
              disabled={month >= thisMonth}
              onPress={() => loadMonth(addMonths(month, 1), payments)}
            />
          </Row>
          <Field
            label="Suma de plată (lei)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0,00"
            large
          />
          <Field
            label="Scadență (opțional)"
            value={due}
            onChangeText={setDue}
            keyboardType="numbers-and-punctuation"
            placeholder="ZZ.LL.AAAA"
            hint="Dacă o completezi, primești reminder înainte de scadență."
          />
          <Row>
            <Button
              title={editing ? 'Actualizează' : 'Salvează'}
              icon="content-save-outline"
              onPress={onSave}
              loading={saving}
              style={{ flex: 1 }}
            />
            {editing ? <IconButton icon="trash-can-outline" label="Șterge luna" color={t.danger} onPress={() => onDelete(editing)} /> : null}
          </Row>
        </Card>

        {payments.length > 0 && (
          <Card style={{ backgroundColor: t.hero, borderColor: t.hero }}>
            <Text style={{ color: t.heroMuted, fontSize: 13 }}>Total ultimele 12 luni</Text>
            <Text style={[styles.big, { color: t.heroText }]}>{formatLei(total12)}</Text>
          </Card>
        )}

        <SectionTitle>Istoric</SectionTitle>
        <Card style={{ paddingVertical: 6 }}>
          {payments.length === 0 && <Body muted>Nicio sumă introdusă încă.</Body>}
          {payments.map((p, i) => (
            <View
              key={p.id}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
            >
              <Pressable style={{ flex: 1, gap: 2 }} onPress={() => loadMonth(p.month, payments)}>
                <Text style={[styles.rowTitle, { color: p.month === month ? t.accent : t.text }]}>
                  {formatMonth(p.month)}
                </Text>
                <Text style={[styles.meta, { color: t.textMuted }]}>
                  {formatLei(p.amount)}
                  {p.due_date ? ` · scadent ${formatDate(p.due_date)}` : ''}
                  {p.paid_at ? ` · plătit ${formatDate(p.paid_at)}` : ''}
                </Text>
              </Pressable>
              <Pressable onPress={() => onTogglePaid(p)} hitSlop={8}>
                <Badge text={p.paid_at ? 'plătit' : 'de plată'} color={p.paid_at ? t.success : t.danger} />
              </Pressable>
              <IconButton icon="trash-can-outline" label={`Șterge ${formatMonth(p.month)}`} color={t.danger} onPress={() => onDelete(p)} />
            </View>
          ))}
        </Card>
        {payments.length > 0 && (
          <Text style={[styles.meta, { color: t.textMuted, paddingHorizontal: 4 }]}>
            Atinge eticheta ca să marchezi plătit / neplătit, luna ca s-o editezi, coșul ca s-o ștergi.
          </Text>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  month: { fontSize: 18, fontWeight: '700', textTransform: 'capitalize' },
  big: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowTitle: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  meta: { fontSize: 13 },
});
