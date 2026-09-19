'use client';

/**
 * Wählt den Datenadapter und stellt ihn der Anwendung bereit.
 *
 * `NEXT_PUBLIC_DATA_MODE` entscheidet — das ist die einzige Stelle, die beim
 * Wechsel auf die zentrale DB angefasst werden muss.
 *
 * Der Stand kommt über `useSyncExternalStore` aus dem Adapter, nicht über
 * einen Effect, der Daten in State schaufelt. Das ist die React-Primitive für
 * externe Datenquellen: kein Zwischenzustand, keine Kaskade von Re-Renders und
 * kein Auseinanderlaufen zweier Komponenten, die im gleichen Render
 * unterschiedliche Stände sehen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { DexieBudgetRepository } from './local/dexie-repository';
import { HttpBudgetRepository } from './remote/http-repository';
import type { BudgetRepository, Snapshot } from './repository';

const EMPTY_SNAPSHOT: Snapshot = {
  household: null,
  users: [],
  pots: [],
  entries: [],
  recurringRules: [],
  itemRules: [],
  receipts: [],
  purchases: [],
  purchaseItems: [],
};

export interface DataContextValue {
  repository: BudgetRepository;
  snapshot: Snapshot;
  /** `true`, solange der erste Snapshot noch nicht geladen ist. */
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

function createRepository(): BudgetRepository {
  return process.env.NEXT_PUBLIC_DATA_MODE === 'remote'
    ? new HttpBudgetRepository()
    : new DexieBudgetRepository();
}

export function DataProvider({ children }: { children: ReactNode }) {
  // Der Adapter darf bei Re-Renders nicht neu entstehen — er hält Cache und
  // Abos. Der State-Initializer läuft genau einmal.
  const [repository] = useState<BudgetRepository>(createRepository);

  const subscribe = useCallback(
    (listener: () => void) => repository.subscribe(listener),
    [repository],
  );

  const cached = useSyncExternalStore(
    subscribe,
    () => repository.getCachedSnapshot(),
    // Beim Server-Rendering gibt es keine lokale Datenbank.
    () => null,
  );

  const error = useSyncExternalStore(
    subscribe,
    () => repository.getLastError(),
    () => null,
  );

  const reload = useCallback(() => repository.refresh(), [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<DataContextValue>(
    () => ({
      repository,
      snapshot: cached ?? EMPTY_SNAPSHOT,
      loading: cached === null && error === null,
      error,
      reload,
    }),
    [repository, cached, error, reload],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData muss innerhalb von <DataProvider> benutzt werden.');
  return context;
}

export function useRepository(): BudgetRepository {
  return useData().repository;
}

export function useSnapshot(): Snapshot {
  return useData().snapshot;
}
