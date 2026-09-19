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
  ItemRule,
  Pot,
  Purchase,
  PurchaseItem,
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
  itemRules!: EntityTable<ItemRule, 'id'>;
  purchases!: EntityTable<Purchase, 'id'>;
  purchaseItems!: EntityTable<PurchaseItem, 'id'>;
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

    /**
     * Version 2: gelernte Zuordnungen für den Bon-Import.
     *
     * Nur die neue Tabelle — die Zeilen oben bleiben unangetastet, sonst
     * verlieren bestehende Installationen ihre Daten. `Entry.splitGroupId` kam
     * im selben Schritt dazu und steht hier bewusst **nicht**: Das Feld wird
     * nicht indiziert, und ein nicht indiziertes Feld braucht keine Migration.
     */
    this.version(2).stores({
      itemRules: 'id, householdId, keyword, potId, deletedAt',
    });

    /**
     * Version 3: die Einzelposten eines Bons.
     *
     * Wieder nur neue Tabellen, wieder ohne `upgrade()`: Ein bestehender
     * Bestand hat keine Einkäufe, und es gibt nichts umzurechnen. Alte Bons
     * bekommen **keine** Posten nachträglich — aus der verketteten Notiz
     * ließen sie sich nicht zurückgewinnen, und geraten wäre schlimmer als
     * leer.
     *
     * `Entry.purchaseId` kam im selben Schritt dazu und steht hier bewusst
     * nicht: nicht indiziert, also keine Migration.
     */
    this.version(3).stores({
      purchases: 'id, householdId, date, deletedAt',
      purchaseItems: 'id, householdId, purchaseId, potId, deletedAt',
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
