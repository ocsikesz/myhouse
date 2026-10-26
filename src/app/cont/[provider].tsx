import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { Body, Button, Card, Field, Screen, SectionTitle, Title } from '@/components/ui';
import { deactivateProvider } from '@/db/repo';
import { confirm, info } from '@/lib/dialogs';
import { clearAccount, getCredentials, saveCredentials, saveTokens } from '@/providers/credentials';
import { ElectricaClient } from '@/providers/electrica';
import { EonClient, type EonMfa } from '@/providers/eon';
import { syncProvider, type AccountProvider } from '@/providers/sync';

const LABEL: Record<AccountProvider, string> = { eon: 'E.ON Myline', electrica: 'MyElectrica' };

export default function AccountScreen() {
  const { provider: raw } = useLocalSearchParams<{ provider: string }>();
  const provider: AccountProvider = raw === 'electrica' ? 'electrica' : 'eon';
  const db = useSQLiteContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState<EonMfa | null>(null);
  const [code, setCode] = useState('');
  const [client, setClient] = useState<EonClient | null>(null);

  useEffect(() => {
    getCredentials(provider).then((c) => {
      if (c) {
        setEmail(c.email);
        setConnected(true);
      }
    });
  }, [provider]);

  async function finish() {
    await saveCredentials(provider, { email: email.trim(), password });
    const result = await syncProvider(db, provider, true);
    setBusy(false);
    if (result.status === 'ok') {
      info('Cont conectat', `Am găsit ${result.meters} ${result.meters === 1 ? 'contor' : 'contoare'}.`);
      router.back();
    } else if (result.status !== 'not_configured') {
      info('Conectat, dar sincronizarea a eșuat', result.message);
      router.back();
    }
  }

  async function onLogin() {
    if (!email.trim() || !password) {
      info('Date lipsă', 'Completează emailul și parola.');
      return;
    }
    setBusy(true);
    const creds = { email: email.trim(), password };

    if (provider === 'eon') {
      const c = new EonClient(creds, null, (t) => saveTokens('eon', t));
      setClient(c);
      const r = await c.login();
      if (r.kind === 'ok') return finish();
      setBusy(false);
      if (r.kind === 'mfa') {
        setMfa(r.mfa);
        return;
      }
      info('Login eșuat', r.kind === 'bad_credentials' ? 'Email sau parolă greșită.' : r.message);
      return;
    }

    const c = new ElectricaClient(creds, null, (t) => saveTokens('electrica', t));
    const r = await c.login();
    if (r.ok) return finish();
    setBusy(false);
    info('Login eșuat', r.message);
  }

  async function onMfa() {
    if (!client || !mfa || !code.trim()) return;
    setBusy(true);
    const r = await client.completeMfa(mfa, code.trim());
    if (r.kind === 'ok') return finish();
    setBusy(false);
    info('Cod respins', r.kind === 'error' ? r.message : 'Încearcă din nou.');
  }

  async function onResend(type?: string) {
    if (!client || !mfa) return;
    const next = await client.resendMfa(mfa, type);
    if (next) {
      setMfa(next);
      info('Cod retrimis', `Verifică ${next.type === 'SMS' ? 'SMS-urile' : 'emailul'}.`);
    } else {
      info('Eroare', 'Codul nu a putut fi retrimis.');
    }
  }

  async function onDisconnect() {
    const ok = await confirm('Deconectezi contul?', 'Parola și sesiunea se șterg de pe telefon. Istoricul rămâne.', 'Deconectează');
    if (!ok) return;
    await clearAccount(provider);
    await deactivateProvider(db, provider);
    router.back();
  }

  return (
    <>
      <Stack.Screen options={{ title: LABEL[provider] }} />
      <Screen>
        {!mfa ? (
          <>
            <SectionTitle>{connected ? 'Cont conectat' : 'Conectează contul'}</SectionTitle>
            <Card>
              <Body muted>
                Folosește aceleași date ca în aplicația {LABEL[provider]}. Parola se păstrează criptat pe telefon și
                este trimisă doar către {provider === 'eon' ? 'E.ON' : 'Electrica'}.
              </Body>
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="nume@exemplu.ro" />
              <Field
                label="Parolă"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder={connected ? '•••••••• (neschimbată)' : ''}
                hint={connected ? 'Introdu parola din nou ca să reconectezi contul.' : undefined}
              />
              <Button title={connected ? 'Reconectează' : 'Conectează'} onPress={onLogin} loading={busy} />
            </Card>
            {connected && <Button title="Deconectează contul" variant="danger" onPress={onDisconnect} />}
          </>
        ) : (
          <>
            <SectionTitle>Verificare în doi pași</SectionTitle>
            <Card>
              <Title>Cod trimis prin {mfa.type === 'SMS' ? 'SMS' : 'email'}</Title>
              {mfa.recipient ? <Body muted>Destinatar: {mfa.recipient}</Body> : null}
              <Field label="Cod" value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" />
              <Button title="Confirmă" onPress={onMfa} loading={busy} />
              <Button title="Retrimite codul" variant="secondary" onPress={() => onResend()} />
              {mfa.alternativeType && mfa.alternativeType !== mfa.type ? (
                <Button
                  title={`Trimite prin ${mfa.alternativeType === 'SMS' ? 'SMS' : 'email'}`}
                  variant="secondary"
                  onPress={() => onResend(mfa.alternativeType)}
                />
              ) : null}
            </Card>
          </>
        )}
      </Screen>
    </>
  );
}
