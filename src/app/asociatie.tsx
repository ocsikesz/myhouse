import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, Body, Button, Card, Divider, Field, Row, Screen, SectionTitle, Title } from '@/components/ui';
import { listAssociationPayments, setAssociationPaid, upsertAssociationPayment } from '@/db/repo';
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

  const { data, reload } = useDbQuery((d) => listAssociationPayments(d, 36));

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
    setDue(existing?.due_date ? formatDate(existing.due_date) : '');
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

  const payments = data ?? [];
  const editing = payments.find((p) => p.month === month);
  const total12 = payments
    .filter((p) => p.month > addMonths(thisMonth, -12))
    .reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Asociația de proprietari' }} />
      <Screen>
        <SectionTitle>Consum lunar</SectionTitle>
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Button title="‹" variant="secondary" onPress={() => loadMonth(previousMonth(month), payments)} />
            <Title>{formatMonth(month)}</Title>
            <Button
              title="›"
              variant="secondary"
              disabled={month >= thisMonth}
              onPress={() => loadMonth(addMonths(month, 1), payments)}
            />
          </Row>
          <Field label="Suma de plată (lei)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
          <Field
            label="Scadență (opțional)"
            value={due}
            onChangeText={setDue}
            keyboardType="numbers-and-punctuation"
            placeholder="ZZ.LL.AAAA"
            hint="Dacă o completezi, primești reminder înainte de scadență."
          />
          <Button title={editing ? 'Actualizează' : 'Salvează'} onPress={onSave} loading={saving} />
        </Card>

        <SectionTitle>Istoric</SectionTitle>
        <Card>
          {payments.length === 0 && <Body muted>Nicio sumă introdusă încă.</Body>}
          {payments.map((p, i) => (
            <View key={p.id}>
              {i > 0 && <Divider />}
              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable style={{ flex: 1, gap: 2 }} onPress={() => loadMonth(p.month, payments)}>
                  <Body>{formatMonth(p.month)}</Body>
                  <Body muted>
                    {formatLei(p.amount)}
                    {p.due_date ? ` · scadent ${formatDate(p.due_date)}` : ''}
                    {p.paid_at ? ` · plătit ${formatDate(p.paid_at)}` : ''}
                  </Body>
                </Pressable>
                <Pressable onPress={() => onTogglePaid(p)} hitSlop={8}>
                  <Badge text={p.paid_at ? 'plătit' : 'de plată'} color={p.paid_at ? t.success : t.danger} />
                </Pressable>
              </Row>
            </View>
          ))}
          {payments.length > 0 && (
            <Body muted>Atinge eticheta ca să marchezi plătit / neplătit. Atinge luna ca s-o editezi.</Body>
          )}
        </Card>

        {payments.length > 0 && (
          <Card>
            <Body muted>Total ultimele 12 luni: {formatLei(total12)}</Body>
          </Card>
        )}
      </Screen>
    </>
  );
}
