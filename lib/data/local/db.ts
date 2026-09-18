/**
 * Dexie-Schema (IndexedDB).
 *
 * Nur diese Datei und `dexie-repository.ts` kennen Dexie. Die ESLint-Regel
 * `no-restricted-imports` in `eslint.config.mjs` hält das durch.
 *
 * Belege liegen in einer eigenen Tabelle: Buchungslisten sollen nicht bei jeder
 * Abfrage mehrere Megabyte Bilddaten mitziehen.
 */

import Dexie, { type EntityTable } from 'dexie';
import type {
  ChangeLogEntry,
  Entry,
  Household,
  Pot,
  Receipt,
  RecurringRule,
  User,
} from '../../domain/types';

export const DB_NAME = 'haushaltsplanung';

export class BudgetDatabase extends Dexie {
  households!: EntityTable<Household, 'id'>;
  users!: EntityTable<User, 'id'>;
  pots!: EntityTable<Pot, 'id'>;
  entries!: EntityTable<Entry, 'id'>;
  recurringRules!: EntityTable<RecurringRule, 'id'>;
  receipts!: EntityTable<Receipt, 'id'>;
  changeLog!: EntityTable<ChangeLogEntry, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);

    /**
     * Version 1. Jede Schemaänderung kommt als neue `version(n).stores(...)`
     * dazu — nie als Änderung dieser Zeilen, sonst verlieren bestehende
     * Installationen ihre Daten.
     */
    this.version(1).stores({
      households: 'id, updatedAt',
      users: 'id, householdId, externalSubject, isLocalDevice',
      pots: 'id, householdId, sortIndex, archivedAt, deletedAt',
      entries: 'id, householdId, date, potId, kind, recurringRuleId, deletedAt, [potId+date]',
      recurringRules: 'id, householdId, potId, paused, deletedAt',
      receipts: 'id, householdId, entryId, deletedAt',
      changeLog: 'id, householdId, entity, at',
    });
  }
}

let instance: BudgetDatabase | null = null;

/** Eine Instanz pro Tab. Mehrere Dexie-Instanzen auf derselben DB blockieren sich. */
export function getDatabase(): BudgetDatabase {
  instance ??= new BudgetDatabase();
  return instance;
}

/** Nur für Tests: frische Datenbank unter eigenem Namen. */
export function createTestDatabase(name: string): BudgetDatabase {
  return new BudgetDatabase(name);
}
