import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';

import { subscribeCloudChanges } from '@/cloud/queue';

/**
 * Rulează o interogare când ecranul devine activ (inclusiv la revenirea pe tab),
 * ca datele să fie mereu proaspete după o modificare făcută în alt ecran.
 */
export function useDbQuery<T>(query: (db: SQLiteDatabase) => Promise<T>, deps: unknown[] = []) {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      query(db)
        .then((result) => {
          if (!cancelled) {
            setData(result);
            setError(null);
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, nonce, ...deps]),
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // Date noi venite de pe alt telefon al familiei → reîncărcăm
  useEffect(() => subscribeCloudChanges(reload), [reload]);
  return { data, error, reload };
}
