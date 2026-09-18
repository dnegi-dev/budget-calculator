'use client';

/**
 * Wählt den Datenadapter und stellt ihn der Anwendung bereit.
 *
 * `NEXT_PUBLIC_DATA_MODE` entscheidet — das ist die einzige Stelle, die beim
 * Wechsel auf die zentrale DB angefasst werden muss.
 *
 * Der Snapshot wird hier gehalten und bei jeder Mutation neu geladen. Grob,
 * aber bei gerätelokalen Haushaltsdaten unmessbar — und der Code bleibt frei
 * von Cache-Invalidierungslogik, die bei zentraler DB ohnehin anders aussieht.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  receipts: [],
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
  // Der Adapter darf bei Re-Renders nicht neu entstehen — er hält die Abos.
  const repositoryRef = useRef<BudgetRepository | null>(null);
  repositoryRef.current ??= createRepository();
  const repository = repositoryRef.current;

  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await repository.loadSnapshot();
      setSnapshot(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void reload();
    return repository.subscribe(() => {
      void reload();
    });
  }, [repository, reload]);

  const value = useMemo<DataContextValue>(
    () => ({ repository, snapshot, loading, error, reload }),
    [repository, snapshot, loading, error, reload],
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
