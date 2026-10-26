import * as SecureStore from 'expo-secure-store';

import type { Provider } from '@/db/types';

/**
 * Credențialele și token-urile furnizorilor stau în SecureStore
 * (criptate cu Android Keystore), niciodată în SQLite.
 */
export interface Credentials {
  email: string;
  password: string;
}

type AccountProvider = Exclude<Provider, 'deservcom'>;

const credKey = (p: AccountProvider) => `cred.${p}`;
const tokenKey = (p: AccountProvider) => `token.${p}`;

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getCredentials(p: AccountProvider): Promise<Credentials | null> {
  return readJson<Credentials>(credKey(p));
}

export async function saveCredentials(p: AccountProvider, c: Credentials): Promise<void> {
  await SecureStore.setItemAsync(credKey(p), JSON.stringify(c));
}

export function getTokens<T>(p: AccountProvider): Promise<T | null> {
  return readJson<T>(tokenKey(p));
}

export async function saveTokens(p: AccountProvider, t: unknown | null): Promise<void> {
  if (t === null) await SecureStore.deleteItemAsync(tokenKey(p));
  else await SecureStore.setItemAsync(tokenKey(p), JSON.stringify(t));
}

export async function clearAccount(p: AccountProvider): Promise<void> {
  await SecureStore.deleteItemAsync(credKey(p));
  await SecureStore.deleteItemAsync(tokenKey(p));
}
