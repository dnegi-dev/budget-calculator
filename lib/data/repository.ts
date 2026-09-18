/**
 * Die einzige Datenschnittstelle der Anwendung.
 *
 * Kein UI-Code kennt IndexedDB, Dexie oder HTTP — alles läuft über dieses
 * Interface. Das ist der Hebel für den späteren Wechsel auf eine zentrale DB:
 * dann wird `local/dexie-repository.ts` gegen `remote/http-repository.ts`
 * getauscht, und der Anwendungscode bleibt unberührt.
 *
 * Zwei Entwurfsentscheidungen, die dafür nötig sind:
 *
 * - **Alles ist `async`**, auch wo IndexedDB synchron sein könnte. Sonst müsste
 *   beim Wechsel jede Signatur und jeder Aufrufer angefasst werden.
 * - **`subscribe()` statt Dexie-Live-Queries.** Ein Listener, der bei jeder
 *   Mutation feuert, lässt sich vom HTTP-Adapter mit Polling oder SSE
 *   nachbilden. Der Preis ist grobe Invalidierung: jede Änderung lädt den
 *   Snapshot neu. Bei geräteloklaen Haushaltsdaten (einige tausend Buchungen)
 *   ist das nicht messbar; bei zentraler DB wird daraus feinere Invalidierung.
 */

import type { ExportFile } from '../domain/schemas';
import type {
  Entry,
  Household,
  IsoDate,
  NewEntryInput,
  NewPotInput,
  NewRecurringRuleInput,
  Pot,
  Receipt,
  ReceiptMeta,
  RecurringRule,
  Role,
  User,
} from '../domain/types';
import type { Principal } from '../rbac/can';

export interface HouseholdSetupInput {
  name: string;
  currency: string;
  locale: string;
  periodStartDay: number;
  displayName?: string;
}

export interface EntryFilter {
  /** Inklusive. */
  fromDate?: IsoDate;
  /** Inklusive. */
  toDate?: IsoDate;
  potIds?: readonly string[];
  kind?: Entry['kind'];
  /** Freitext über Notiz und Händler. */
  search?: string;
  limit?: number;
}

/**
 * Alle Daten außer Beleg-Binärdaten in einem Zug.
 *
 * Bewusst grob: Die Oberfläche rechnet abgeleitete Werte (Restbeträge,
 * Auswertungen) lokal aus einem Snapshot, statt für jede Kennzahl eine Query
 * zu stellen. Das hält die Schnittstelle klein und die Domänenlogik rein.
 */
export interface Snapshot {
  household: Household | null;
  users: User[];
  pots: Pot[];
  entries: Entry[];
  recurringRules: RecurringRule[];
  receipts: ReceiptMeta[];
}

export interface ImportResult {
  mode: 'replace' | 'merge';
  pots: number;
  entries: number;
  recurringRules: number;
  receipts: number;
  skipped: number;
}

export interface ReceiptStorageStats {
  count: number;
  byteSize: number;
}

export interface ReceiptUpload {
  filename: string;
  mime: string;
  blob: Blob;
  thumbnail: Blob | null;
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} ist in diesem Datenmodus nicht verfügbar.`);
    this.name = 'NotImplementedError';
  }
}

export interface BudgetRepository {
  /** Woher die Daten kommen — für Anzeige in den Einstellungen. */
  readonly mode: 'local' | 'remote';

  /**
   * Sagt dem Adapter, wer gerade handelt. Wird vom Auth-Provider gesetzt.
   * Getrennt vom Konstruktor, weil der Nutzer erst aus der Datenbank gelesen
   * werden muss, die dieser Adapter bereitstellt.
   */
  setPrincipalResolver(resolver: () => Principal | null): void;

  /** Feuert nach jeder Mutation. Rückgabe hebt das Abo auf. */
  subscribe(listener: () => void): () => void;

  loadSnapshot(): Promise<Snapshot>;

  getHousehold(): Promise<Household | null>;
  /** Legt Haushalt und lokalen Gerätenutzer an. Nur erlaubt, solange kein Haushalt existiert. */
  setupHousehold(input: HouseholdSetupInput): Promise<{ household: Household; user: User }>;
  updateHousehold(patch: Partial<Omit<Household, 'id' | 'createdAt' | 'revision'>>): Promise<Household>;

  listUsers(): Promise<User[]>;
  getLocalDeviceUser(): Promise<User | null>;
  setUserRole(userId: string, role: Role): Promise<User>;

  listPots(options?: { includeArchived?: boolean }): Promise<Pot[]>;
  getPot(id: string): Promise<Pot | null>;
  createPot(input: NewPotInput): Promise<Pot>;
  updatePot(id: string, patch: Partial<NewPotInput>): Promise<Pot>;
  setPotArchived(id: string, archived: boolean): Promise<Pot>;
  /** Soft Delete. Buchungen bleiben erhalten und verlieren ihre Zuordnung. */
  deletePot(id: string): Promise<void>;

  listEntries(filter?: EntryFilter): Promise<Entry[]>;
  getEntry(id: string): Promise<Entry | null>;
  createEntry(input: NewEntryInput): Promise<Entry>;
  createEntries(inputs: readonly NewEntryInput[]): Promise<Entry[]>;
  updateEntry(id: string, patch: Partial<NewEntryInput>): Promise<Entry>;
  deleteEntry(id: string): Promise<void>;

  listRecurringRules(): Promise<RecurringRule[]>;
  createRecurringRule(input: NewRecurringRuleInput): Promise<RecurringRule>;
  updateRecurringRule(id: string, patch: Partial<NewRecurringRuleInput>): Promise<RecurringRule>;
  setRecurringRulePaused(id: string, paused: boolean): Promise<RecurringRule>;
  deleteRecurringRule(id: string): Promise<void>;
  /** Erzeugt fällige Buchungen aus allen Regeln. Idempotent, darf beliebig oft laufen. */
  materializeRecurringRules(today: IsoDate): Promise<number>;

  listReceipts(entryId?: string): Promise<ReceiptMeta[]>;
  addReceipt(entryId: string, upload: ReceiptUpload): Promise<ReceiptMeta>;
  getReceipt(id: string): Promise<Receipt | null>;
  deleteReceipt(id: string): Promise<void>;
  receiptStorageStats(): Promise<ReceiptStorageStats>;

  exportAll(options: { includeReceipts: boolean }): Promise<ExportFile>;
  importAll(file: ExportFile, mode: 'replace' | 'merge'): Promise<ImportResult>;
  /** Löscht alle lokalen Daten. Nur aus den Einstellungen und nur mit Rückfrage. */
  wipeAll(): Promise<void>;

  /** Offene Einträge der Outbox — in v1 rein informativ. */
  pendingChangeCount(): Promise<number>;
}
