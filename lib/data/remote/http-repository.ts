/**
 * Platzhalter für den Betrieb gegen eine zentrale API.
 *
 * Diese Datei existiert ab Tag 1 — nicht als Attrappe, sondern damit das
 * `BudgetRepository`-Interface von Anfang an von zwei Seiten benutzt wird. Ein
 * Interface, das nur eine Implementierung hat, ist erfahrungsgemäß an die
 * Implementierung angepasst und nicht umgekehrt.
 *
 * Der spätere Umbau ist damit Ausfüllen, kein Umbauen: jede Methode wird ein
 * `fetch` gegen den zugehörigen Route Handler. Reihenfolge und Zuordnung stehen
 * in docs/roadmap-server.md.
 */

import type { ExportFile } from '../../domain/schemas';
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
} from '../../domain/types';
import type { Principal } from '../../rbac/can';
import type {
  BudgetRepository,
  EntryFilter,
  HouseholdSetupInput,
  ImportResult,
  ReceiptStorageStats,
  ReceiptUpload,
  Snapshot,
} from '../repository';
import { NotImplementedError } from '../repository';

export class HttpBudgetRepository implements BudgetRepository {
  readonly mode = 'remote' as const;

  private readonly baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api') {
    this.baseUrl = baseUrl;
  }

  /** Nur damit `baseUrl` benutzt wird und beim Ausfüllen sofort zur Hand ist. */
  protected url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  setPrincipalResolver(_resolver: () => Principal | null): void {
    // Serverseitig kommt der Principal aus der Session, nicht aus dem Client.
  }

  subscribe(_listener: () => void): () => void {
    // Später: SSE oder Polling gegen /api/changes.
    return () => {};
  }

  getCachedSnapshot(): Snapshot | null {
    return null;
  }

  getLastError(): Error | null {
    return new NotImplementedError('Zentrale Datenhaltung');
  }

  refresh(): Promise<void> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  loadSnapshot(): Promise<Snapshot> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  getHousehold(): Promise<Household | null> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  setupHousehold(_input: HouseholdSetupInput): Promise<{ household: Household; user: User }> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  updateHousehold(
    _patch: Partial<Omit<Household, 'id' | 'createdAt' | 'revision'>>,
  ): Promise<Household> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  listUsers(): Promise<User[]> {
    throw new NotImplementedError('Nutzerverwaltung');
  }

  getLocalDeviceUser(): Promise<User | null> {
    throw new NotImplementedError('Nutzerverwaltung');
  }

  setUserRole(_userId: string, _role: Role): Promise<User> {
    throw new NotImplementedError('Nutzerverwaltung');
  }

  /**
   * Der Notausgang aus dem lokalen Betrieb hat serverseitig keine Entsprechung
   * und darf sie auch nicht haben: Wer sich dort die Rechte nimmt, bekommt sie
   * von einem anderen Admin zurück, nicht per Knopfdruck.
   */
  resetLocalDeviceRole(): Promise<User | null> {
    throw new NotImplementedError('Rollen-Notausgang');
  }

  listPots(_options?: { includeArchived?: boolean }): Promise<Pot[]> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  getPot(_id: string): Promise<Pot | null> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  createPot(_input: NewPotInput): Promise<Pot> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  updatePot(_id: string, _patch: Partial<NewPotInput>): Promise<Pot> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  setPotArchived(_id: string, _archived: boolean): Promise<Pot> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  deletePot(_id: string): Promise<void> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  listEntries(_filter?: EntryFilter): Promise<Entry[]> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  getEntry(_id: string): Promise<Entry | null> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  createEntry(_input: NewEntryInput): Promise<Entry> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  createEntries(_inputs: readonly NewEntryInput[]): Promise<Entry[]> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  updateEntry(_id: string, _patch: Partial<NewEntryInput>): Promise<Entry> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  deleteEntry(_id: string): Promise<void> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  listRecurringRules(): Promise<RecurringRule[]> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  createRecurringRule(_input: NewRecurringRuleInput): Promise<RecurringRule> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  updateRecurringRule(
    _id: string,
    _patch: Partial<NewRecurringRuleInput>,
  ): Promise<RecurringRule> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  setRecurringRulePaused(_id: string, _paused: boolean): Promise<RecurringRule> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  deleteRecurringRule(_id: string): Promise<void> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  materializeRecurringRules(_today: IsoDate): Promise<number> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  listReceipts(_entryId?: string): Promise<ReceiptMeta[]> {
    throw new NotImplementedError('Belegspeicher');
  }

  addReceipt(_entryId: string, _upload: ReceiptUpload): Promise<ReceiptMeta> {
    throw new NotImplementedError('Belegspeicher');
  }

  getReceipt(_id: string): Promise<Receipt | null> {
    throw new NotImplementedError('Belegspeicher');
  }

  deleteReceipt(_id: string): Promise<void> {
    throw new NotImplementedError('Belegspeicher');
  }

  receiptStorageStats(): Promise<ReceiptStorageStats> {
    throw new NotImplementedError('Belegspeicher');
  }

  exportAll(_options: { includeReceipts: boolean }): Promise<ExportFile> {
    throw new NotImplementedError('Export');
  }

  importAll(_file: ExportFile, _mode: 'replace' | 'merge'): Promise<ImportResult> {
    throw new NotImplementedError('Import');
  }

  wipeAll(): Promise<void> {
    throw new NotImplementedError('Zentrale Datenhaltung');
  }

  pendingChangeCount(): Promise<number> {
    return Promise.resolve(0);
  }
}
