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
 * - **`subscribe()` + synchroner Cache statt Dexie-Live-Queries.** Der Adapter
 *   hält den letzten Snapshot und benachrichtigt nach jeder Mutation. Damit
 *   kann die Oberfläche `useSyncExternalStore` benutzen — die React-Primitive
 *   für genau diesen Fall — statt Daten per Effect in State zu schaufeln. Der
 *   HTTP-Adapter bildet dasselbe mit Polling oder SSE nach.
 *
 *   Der Preis ist grobe Invalidierung: jede Änderung lädt den Snapshot neu.
 *   Bei gerätelokalen Haushaltsdaten (einige tausend Buchungen) ist das nicht
 *   messbar; bei zentraler DB wird daraus feinere Invalidierung.
 */

import type { ExportFile } from '../domain/schemas';
import type {
  Entry,
  Household,
  ItemRule,
  IsoDate,
  NewEntryInput,
  NewPotInput,
  NewPurchaseInput,
  NewRecurringRuleInput,
  Pot,
  Purchase,
  PurchaseItem,
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
  /** Nur Buchungen mit diesem Tag — Schreibweise ist gleichgültig. */
  tag?: string;
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
  itemRules: ItemRule[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
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

  /** Feuert nach jeder Mutation und nach jedem Neuladen. Rückgabe hebt das Abo auf. */
  subscribe(listener: () => void): () => void;

  /**
   * Der zuletzt geladene Stand, **synchron**. `null`, solange nie geladen
   * wurde. Muss zwischen zwei Benachrichtigungen identisch bleiben (gleiche
   * Objektreferenz), sonst rendert `useSyncExternalStore` endlos.
   */
  getCachedSnapshot(): Snapshot | null;

  /** Fehler des letzten Ladeversuchs, sonst `null`. */
  getLastError(): Error | null;

  /** Lädt neu, aktualisiert den Cache und benachrichtigt. */
  refresh(): Promise<void>;

  /** Liest frisch aus der Quelle, ohne den Cache zu benutzen. */
  loadSnapshot(): Promise<Snapshot>;

  getHousehold(): Promise<Household | null>;
  /** Legt Haushalt und lokalen Gerätenutzer an. Nur erlaubt, solange kein Haushalt existiert. */
  setupHousehold(input: HouseholdSetupInput): Promise<{ household: Household; user: User }>;

  /**
   * Stellt eine Sicherung wieder her, **bevor** ein Haushalt existiert.
   *
   * Nötig für den Fall, der sonst in einer Sackgasse endet: neues Gerät oder
   * nach „Alles löschen". Der normale Import (`importAll`) verlangt das Recht
   * `data.import` — das aber an einem Nutzer hängt, den es dann noch nicht
   * gibt. Deshalb ein eigener Weg, der ausschließlich bei leerer Datenbank
   * erlaubt ist.
   */
  restoreFromBackup(file: ExportFile): Promise<ImportResult>;
  updateHousehold(
    patch: Partial<Omit<Household, 'id' | 'createdAt' | 'revision'>>,
  ): Promise<Household>;

  listUsers(): Promise<User[]>;
  getLocalDeviceUser(): Promise<User | null>;
  setUserRole(userId: string, role: Role): Promise<User>;
  /**
   * Notausgang: setzt den Gerätenutzer zurück auf `admin`, **ohne**
   * Rechteprüfung.
   *
   * Nötig, weil sich sonst jemand aussperren kann: Wer seine eigene Rolle auf
   * `viewer` setzt, darf danach weder Rollen ändern noch importieren noch
   * löschen — die Daten wären unerreichbar. Auf einem Gerät ohne Anmeldung ist
   * das auch keine Sicherheitslücke: Wer das Gerät hat, hat die Daten ohnehin.
   *
   * In der Server-Implementierung darf es diese Methode **nicht** geben; dort
   * ist die Rollenvergabe Sache eines anderen Admins.
   */
  resetLocalDeviceRole(): Promise<User | null>;

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

  /**
   * Ein eingelesener Bon: Einkauf, Posten und die daraus gerechneten
   * Buchungen in **einem** Zug.
   *
   * Die Gruppierung passiert im Repository und nicht in der Oberfläche —
   * dieselbe Begründung wie beim Standardtopf: Eine künftige API geht an
   * jedem Formular vorbei.
   */
  createPurchase(input: NewPurchaseInput): Promise<{ purchase: Purchase; entries: Entry[] }>;
  /**
   * Topf oder Tags eines Postens ändern; die Buchungen des Einkaufs werden
   * neu gerechnet. Betrag und Bezeichnung sind nicht dabei: Sie stehen so auf
   * dem Beleg, und die Summenprobe soll eine Aussage über ihn bleiben.
   */
  updatePurchaseItem(
    id: string,
    patch: { potId?: string | null; tags?: string[] },
  ): Promise<Entry[]>;
  /** Einkauf, Posten, Buchungen und Beleg — nicht rückgängig zu machen. */
  deletePurchase(id: string): Promise<void>;

  listRecurringRules(): Promise<RecurringRule[]>;
  createRecurringRule(input: NewRecurringRuleInput): Promise<RecurringRule>;
  updateRecurringRule(id: string, patch: Partial<NewRecurringRuleInput>): Promise<RecurringRule>;
  setRecurringRulePaused(id: string, paused: boolean): Promise<RecurringRule>;
  deleteRecurringRule(id: string): Promise<void>;
  /** Erzeugt fällige Buchungen aus allen Regeln. Idempotent, darf beliebig oft laufen. */
  materializeRecurringRules(today: IsoDate): Promise<number>;
  /** Sperrt jeden Sparziel-Topf, dessen Frist verstrichen ist. Idempotent. */
  lockDueGoalPots(today: IsoDate): Promise<number>;

  /**
   * Benennt einen Tag in allen Buchungen um, in einer Transaktion. Rückgabe:
   * Anzahl der geänderten Buchungen.
   *
   * Sammeloperationen gehören hierher und nicht in die Oberfläche: Nur hier
   * sind sie atomar, und nur hier entsteht für jede berührte Buchung die Zeile
   * in der Outbox.
   */
  renameTag(from: string, to: string): Promise<number>;
  /** Nimmt einen Tag aus allen Buchungen. Die Buchungen selbst bleiben. */
  deleteTag(tag: string): Promise<number>;

  listItemRules(): Promise<ItemRule[]>;
  /**
   * Merkt sich „Schlagwort → Topf". Dasselbe Schlagwort ein zweites Mal
   * überschreibt die alte Zuordnung, statt eine zweite anzulegen — sonst
   * entscheidet die Reihenfolge, und das wäre nicht erklärbar.
   */
  rememberItemRule(keyword: string, potId: string): Promise<ItemRule>;
  forgetItemRule(id: string): Promise<void>;

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
