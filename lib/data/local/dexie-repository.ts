/**
 * Die lokale Implementierung: alle Daten in IndexedDB auf dem Gerät.
 *
 * Drei Dinge passieren hier über das reine Speichern hinaus:
 *
 * 1. **Rechteprüfung.** Jede mutierende Methode beginnt mit `assertCan(...)`.
 *    Das ist keine Kosmetik für v1 (es gibt nur einen Admin), sondern die
 *    Stelle, die nach Einführung von SSO unverändert in den Server wandert.
 * 2. **Sync-Metadaten.** `revision` und `updatedAt` werden bei jeder Änderung
 *    gesetzt, Löschungen sind Soft Deletes.
 * 3. **Outbox.** Jede Mutation schreibt in derselben Transaktion einen Eintrag
 *    in `changeLog`. In v1 liest das niemand; ohne diese Spur ist eine
 *    nachträgliche Synchronisation aber nicht möglich, weil niemand mehr weiß,
 *    was seit wann geändert wurde.
 */

import type { Table } from 'dexie';
import { getDatabase, type BudgetDatabase } from './db';
import { newId } from '../../domain/ids';
import { nowIso, todayIso } from '../../domain/dates';
import { clampPeriodStartDay } from '../../domain/period';
import { applyPotKindPreset, isGoalDue } from '../../domain/pot-kinds';
import { adoptIntoHousehold, repairReferences } from '../../domain/backup';
import { planPurchaseEntries } from '../../domain/purchase';
import { materializeRule } from '../../domain/recurrence';
import { dedupeTags, hasTag, normalizeTag, removeTag, tagKey } from '../../domain/tags';
import {
  clampText,
  EXPORT_SCHEMA_VERSION,
  TEXT_LIMITS,
  type ExportFile,
  type ReceiptExport,
} from '../../domain/schemas';
import type {
  ChangeLogEntry,
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
} from '../../domain/types';
import { assertCan, type Principal } from '../../rbac/can';
import { base64ToBlob, blobToBase64 } from '../blobs';
import {
  ForeignHouseholdError,
  type BudgetRepository,
  type EntryFilter,
  type HouseholdSetupInput,
  type ImportOptions,
  type ImportResult,
  type ReceiptStorageStats,
  type ReceiptUpload,
  type Snapshot,
} from '../repository';

/** Was der Import von einer Tabelle braucht — schmal, damit jede Tabelle passt. */
interface WritableTable<T> {
  get(id: string): Promise<T | undefined>;
  put(record: T): Promise<unknown>;
}

const DEFAULT_POT_COLORS = ['emerald', 'sky', 'amber', 'violet', 'rose', 'slate'] as const;

export class DexieBudgetRepository implements BudgetRepository {
  readonly mode = 'local' as const;

  private readonly db: BudgetDatabase;
  private readonly listeners = new Set<() => void>();
  private readonly writeChangeLog: boolean;
  private principalResolver: () => Principal | null = () => null;
  private cachedSnapshot: Snapshot | null = null;
  private lastError: Error | null = null;

  constructor(
    db: BudgetDatabase = getDatabase(),
    writeChangeLog = process.env.NEXT_PUBLIC_CHANGE_LOG !== 'off',
  ) {
    this.db = db;
    this.writeChangeLog = writeChangeLog;
  }

  setPrincipalResolver(resolver: () => Principal | null): void {
    this.principalResolver = resolver;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getCachedSnapshot(): Snapshot | null {
    return this.cachedSnapshot;
  }

  getLastError(): Error | null {
    return this.lastError;
  }

  async refresh(): Promise<void> {
    try {
      this.cachedSnapshot = await this.loadSnapshot();
      this.lastError = null;
    } catch (caught) {
      this.lastError = caught instanceof Error ? caught : new Error(String(caught));
    }
    this.emit();
  }

  // --------------------------------------------------------------- Snapshot

  async loadSnapshot(): Promise<Snapshot> {
    const [
      household,
      users,
      pots,
      entries,
      recurringRules,
      receipts,
      itemRules,
      purchases,
      purchaseItems,
    ] = await Promise.all([
      this.getHousehold(),
      this.db.users.toArray(),
      this.db.pots.toArray(),
      this.db.entries.toArray(),
      this.db.recurringRules.toArray(),
      this.db.receipts.toArray(),
      this.db.itemRules.toArray(),
      this.db.purchases.toArray(),
      this.db.purchaseItems.toArray(),
    ]);

    return {
      household,
      users: users.filter(alive),
      pots: pots.filter(alive).sort(bySortIndex),
      entries: entries.filter(alive).sort(byDateDesc),
      recurringRules: recurringRules.filter(alive),
      // Blobs werden hier absichtlich abgeworfen: Listen brauchen nur Metadaten.
      receipts: receipts.filter(alive).map(stripBlobs),
      itemRules: itemRules.filter(alive),
      purchases: purchases.filter(alive),
      // Nach `sortIndex`, damit die Einkaufsansicht die Reihenfolge des Bons
      // zeigt und nicht die der Datenbank.
      purchaseItems: purchaseItems.filter(alive).sort((a, b) => a.sortIndex - b.sortIndex),
    };
  }

  // -------------------------------------------------------------- Haushalt

  async getHousehold(): Promise<Household | null> {
    const households = await this.db.households.toArray();
    const stored = households[0];
    return stored ? withHouseholdDefaults(stored) : null;
  }

  /**
   * Ersteinrichtung. Braucht keine Rechteprüfung, weil es noch niemanden gibt,
   * der Rechte haben könnte — aber genau deshalb nur erlaubt, solange kein
   * Haushalt existiert.
   */
  async setupHousehold(input: HouseholdSetupInput): Promise<{ household: Household; user: User }> {
    const existing = await this.getHousehold();
    if (existing !== null) {
      throw new Error('Es gibt bereits einen Haushalt auf diesem Gerät.');
    }

    const at = nowIso();
    const household: Household = {
      id: newId(),
      name: requireText(input.name, TEXT_LIMITS.householdName, 'Name fehlt.'),
      currency: input.currency,
      locale: input.locale,
      periodStartDay: clampPeriodStartDay(input.periodStartDay),
      defaultPotId: null,
      askForPot: true,
      tagsEnabled: false,
      fabDefault: 'expense',
      fabScopes: {},
      onboardingCompletedAt: null,
      createdAt: at,
      updatedAt: at,
      revision: 1,
    };

    const user: User = {
      id: newId(),
      householdId: household.id,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      displayName: clampText(input.displayName, TEXT_LIMITS.displayName) ?? 'Ich',
      // Wer den Haushalt anlegt, ist Admin. Weitere Rollen ergeben erst mit
      // zentraler DB Sinn, sind aber ab jetzt zuweisbar.
      role: 'admin',
      externalSubject: null,
      isLocalDevice: true,
    };

    await this.db.transaction(
      'rw',
      this.db.households,
      this.db.users,
      this.db.changeLog,
      async () => {
        await this.db.households.add(household);
        await this.db.users.add(user);
        await this.log('household', household.id, 'upsert', household.revision, household.id);
        await this.log('user', user.id, 'upsert', user.revision, household.id);
      },
    );

    await this.notify();
    return { household, user };
  }

  /**
   * Siehe `BudgetRepository.restoreFromBackup`. Ohne Rechteprüfung, aber nur
   * bei leerer Datenbank — danach greift wieder `importAll` mit `data.import`.
   */
  async restoreFromBackup(file: ExportFile): Promise<ImportResult> {
    const existing = await this.getHousehold();
    if (existing !== null) {
      throw new Error(
        'Auf diesem Gerät gibt es schon einen Haushalt. Nutze den Import in den Einstellungen.',
      );
    }
    return this.writeImport(file, 'replace');
  }

  async updateHousehold(
    patch: Partial<Omit<Household, 'id' | 'createdAt' | 'revision'>>,
  ): Promise<Household> {
    const current = await this.requireHousehold();
    // Der Abschluss der Ersteinrichtung ist selbst noch keine Einstellung —
    // sonst könnte ihn niemand auslösen, dessen Rolle noch nicht steht.
    const onlyOnboarding =
      Object.keys(patch).length === 1 && Object.hasOwn(patch, 'onboardingCompletedAt');
    if (!onlyOnboarding) this.assert('settings.manage');
    // Derselbe Maßstab wie für jede Buchung: Ein Standardtopf, der gesperrt
    // oder weg ist, wäre ein Ziel, das `createEntries` dann still verwirft.
    if (patch.defaultPotId != null && patch.defaultPotId !== current.defaultPotId) {
      await this.assertPotOpen(patch.defaultPotId);
    }

    const updated: Household = {
      ...current,
      ...patch,
      name:
        patch.name === undefined
          ? current.name
          : requireText(patch.name, TEXT_LIMITS.householdName, 'Name fehlt.'),
      periodStartDay:
        patch.periodStartDay === undefined
          ? current.periodStartDay
          : clampPeriodStartDay(patch.periodStartDay),
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: nowIso(),
      revision: current.revision + 1,
    };

    await this.db.transaction('rw', this.db.households, this.db.changeLog, async () => {
      await this.db.households.put(updated);
      await this.log('household', updated.id, 'upsert', updated.revision, updated.id);
    });

    await this.notify();
    return updated;
  }

  // ---------------------------------------------------------------- Nutzer

  async listUsers(): Promise<User[]> {
    return (await this.db.users.toArray()).filter(alive);
  }

  async getLocalDeviceUser(): Promise<User | null> {
    const users = await this.listUsers();
    return users.find((user) => user.isLocalDevice) ?? users[0] ?? null;
  }

  async setUserRole(userId: string, role: Role): Promise<User> {
    this.assert('member.manage');
    const user = await this.db.users.get(userId);
    if (!user || !alive(user)) throw new Error('Nutzer nicht gefunden.');

    const updated: User = { ...user, role, updatedAt: nowIso(), revision: user.revision + 1 };
    await this.db.transaction('rw', this.db.users, this.db.changeLog, async () => {
      await this.db.users.put(updated);
      await this.log('user', updated.id, 'upsert', updated.revision, updated.householdId);
    });

    await this.notify();
    return updated;
  }

  /**
   * Siehe `BudgetRepository.resetLocalDeviceRole` — bewusst ohne `assert`.
   * Betrifft ausschließlich den Nutzer, der dieses Gerät repräsentiert.
   */
  async resetLocalDeviceRole(): Promise<User | null> {
    const user = await this.getLocalDeviceUser();
    if (!user || user.role === 'admin') return user;

    const updated: User = {
      ...user,
      role: 'admin',
      updatedAt: nowIso(),
      revision: user.revision + 1,
    };
    await this.db.transaction('rw', this.db.users, this.db.changeLog, async () => {
      await this.db.users.put(updated);
      await this.log('user', updated.id, 'upsert', updated.revision, updated.householdId);
    });

    await this.notify();
    return updated;
  }

  // ----------------------------------------------------------------- Töpfe

  async listPots(options?: { includeArchived?: boolean }): Promise<Pot[]> {
    const pots = (await this.db.pots.toArray()).filter(alive).sort(bySortIndex);
    return options?.includeArchived ? pots : pots.filter((pot) => pot.archivedAt === null);
  }

  async getPot(id: string): Promise<Pot | null> {
    const pot = await this.db.pots.get(id);
    return pot && alive(pot) ? pot : null;
  }

  async createPot(input: NewPotInput): Promise<Pot> {
    this.assert('pot.create');
    const household = await this.requireHousehold();
    const existing = await this.listPots({ includeArchived: true });
    const at = nowIso();

    const pot: Pot = {
      id: newId(),
      householdId: household.id,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      name: requireText(input.name, TEXT_LIMITS.potName, 'Name fehlt.'),
      icon: input.icon ?? '🧺',
      color:
        input.color ?? (DEFAULT_POT_COLORS[existing.length % DEFAULT_POT_COLORS.length] as string),
      sortIndex: input.sortIndex ?? existing.length,
      archivedAt: null,
      ...applyPotKindPreset(input.kind, input.limitCents),
      // Eine abweichende Kombination aus Limit und Übertrag ist erlaubt — das
      // Preset ist nur der Startpunkt.
      carryOver: input.carryOver,
      goalCents: input.kind === 'goal' ? (input.goalCents ?? null) : null,
      targetDate: input.kind === 'goal' ? (input.targetDate ?? null) : null,
      lockedAt: null,
      goalPhase: input.kind === 'goal' ? (input.goalPhase ?? 'saving') : null,
    };

    await this.db.transaction('rw', this.db.pots, this.db.changeLog, async () => {
      await this.db.pots.add(pot);
      await this.log('pot', pot.id, 'upsert', pot.revision, pot.householdId);
    });

    await this.notify();
    return pot;
  }

  async updatePot(id: string, patch: Partial<NewPotInput>): Promise<Pot> {
    this.assert('pot.edit');
    const pot = await this.getPot(id);
    if (!pot) throw new Error('Topf nicht gefunden.');

    const kind = patch.kind ?? pot.kind;
    const limitCents = patch.limitCents === undefined ? pot.limitCents : patch.limitCents;
    const goalCents = patch.goalCents === undefined ? pot.goalCents : patch.goalCents;
    const targetDate = patch.targetDate === undefined ? pot.targetDate : patch.targetDate;
    const goalPhase = patch.goalPhase === undefined ? (pot.goalPhase ?? 'saving') : patch.goalPhase;

    /**
     * Entsperren ist ein bewusster Schritt, kein Knopf: Erst eine neue, in
     * der Zukunft liegende Frist hebt die Sperre auf. Ohne neue Frist bleibt
     * `lockedAt` unangetastet — ein Nutzer kann es nicht direkt anfassen.
     */
    const unlocking = pot.lockedAt !== null && targetDate !== null && targetDate > todayIso();
    const lockedAt = unlocking ? null : pot.lockedAt;

    const updated: Pot = {
      ...pot,
      ...patch,
      name:
        patch.name === undefined
          ? pot.name
          : requireText(patch.name, TEXT_LIMITS.potName, 'Name fehlt.'),
      kind,
      // Limit und Übertrag bleiben frei einstellbar; nur bei 'category' und
      // 'goal' erzwingt das Preset „kein Limit“, weil sonst widersprüchliche
      // Zustände entstehen.
      limitCents: kind === 'category' || kind === 'goal' ? null : limitCents,
      carryOver: patch.carryOver ?? pot.carryOver,
      goalCents: kind === 'goal' ? goalCents : null,
      targetDate: kind === 'goal' ? targetDate : null,
      lockedAt,
      goalPhase: kind === 'goal' ? goalPhase : null,
      updatedAt: nowIso(),
      revision: pot.revision + 1,
    };

    await this.db.transaction('rw', this.db.pots, this.db.changeLog, async () => {
      await this.db.pots.put(updated);
      await this.log('pot', updated.id, 'upsert', updated.revision, updated.householdId);
    });

    await this.notify();
    return updated;
  }

  async setPotArchived(id: string, archived: boolean): Promise<Pot> {
    this.assert('pot.edit');
    const pot = await this.getPot(id);
    if (!pot) throw new Error('Topf nicht gefunden.');

    const at = nowIso();
    const updated: Pot = {
      ...pot,
      archivedAt: archived ? at : null,
      updatedAt: at,
      revision: pot.revision + 1,
    };

    await this.db.transaction(
      'rw',
      this.db.pots,
      this.db.households,
      this.db.changeLog,
      async () => {
        await this.db.pots.put(updated);
        await this.log('pot', updated.id, 'upsert', updated.revision, updated.householdId);
        if (archived) await this.detachDefaultPot(pot.id, at);
      },
    );

    await this.notify();
    return updated;
  }

  /**
   * Sperrt jeden Sparziel-Topf, dessen Frist verstrichen ist — gebaut wie
   * `materializeRecurringRules`, gleicher Aufrufort (`AppGate.tsx`, einmal
   * pro Sitzung), gleiche Fehlerbehandlung.
   *
   * Setzt `lockedAt`, nicht `archivedAt`: Die Sperre ist eine automatische
   * Folge der Frist, kein Nutzerwunsch, und sie hebt sich nur durch eine neue
   * Frist wieder auf (`updatePot`) — nicht durch den „Wieder aktivieren“-
   * Knopf des Archivierens.
   */
  async lockDueGoalPots(today: IsoDate = todayIso()): Promise<number> {
    const at = nowIso();
    let locked = 0;
    await this.db.transaction(
      'rw',
      this.db.pots,
      this.db.households,
      this.db.changeLog,
      async () => {
        // In der Transaktion gelesen: Laufen zwei Tabs gleichzeitig an, sieht
        // der zweite die Sperre des ersten und schreibt nichts doppelt.
        const due = (await this.db.pots.toArray()).filter(
          (pot) => alive(pot) && pot.lockedAt === null && isGoalDue(pot, today),
        );
        for (const pot of due) {
          const updated: Pot = { ...pot, lockedAt: at, updatedAt: at, revision: pot.revision + 1 };
          await this.db.pots.put(updated);
          await this.log('pot', updated.id, 'upsert', updated.revision, updated.householdId, at);
          // Wie beim Archivieren: Ein Standardtopf, der nichts mehr annimmt,
          // wäre ein Ziel, das jede Ausgabe ohne Topf ablehnt.
          await this.detachDefaultPot(pot.id, at);
        }
        locked = due.length;
      },
    );

    if (locked > 0) await this.notify();
    return locked;
  }

  /**
   * Soft Delete. Die Buchungen bleiben bestehen und verlieren nur ihre
   * Zuordnung — Historie zu löschen, weil ein Topf nicht mehr gebraucht wird,
   * wäre überraschend. Wer den Topf nur aus der Liste haben will, archiviert.
   */
  async deletePot(id: string): Promise<void> {
    this.assert('pot.delete');
    const pot = await this.getPot(id);
    if (!pot) return;

    const at = nowIso();
    await this.db.transaction(
      'rw',
      [
        this.db.pots,
        this.db.entries,
        this.db.recurringRules,
        this.db.households,
        this.db.itemRules,
        this.db.purchaseItems,
        this.db.changeLog,
      ],
      async () => {
        await this.db.pots.put({
          ...pot,
          deletedAt: at,
          updatedAt: at,
          revision: pot.revision + 1,
        });
        await this.log('pot', pot.id, 'delete', pot.revision + 1, pot.householdId);
        await this.detachDefaultPot(pot.id, at);

        const affected = (await this.db.entries.where('potId').equals(id).toArray()).filter(alive);
        for (const entry of affected) {
          const detached: Entry = {
            ...entry,
            potId: null,
            updatedAt: at,
            revision: entry.revision + 1,
          };
          await this.db.entries.put(detached);
          await this.log('entry', detached.id, 'upsert', detached.revision, detached.householdId);
        }

        const rules = (await this.db.recurringRules.where('potId').equals(id).toArray()).filter(
          alive,
        );
        for (const rule of rules) {
          const detached: RecurringRule = {
            ...rule,
            potId: null,
            paused: true,
            updatedAt: at,
            revision: rule.revision + 1,
          };
          await this.db.recurringRules.put(detached);
          await this.log(
            'recurringRule',
            detached.id,
            'upsert',
            detached.revision,
            detached.householdId,
          );
        }

        // Eine gelernte Zuordnung ohne Ziel ist wertlos (und das Schema
        // verlangt einen Topf) — sie fällt weg.
        const itemRules = (await this.db.itemRules.toArray()).filter(
          (rule) => alive(rule) && rule.potId === id,
        );
        for (const rule of itemRules) {
          await this.db.itemRules.put({
            ...rule,
            deletedAt: at,
            updatedAt: at,
            revision: rule.revision + 1,
          });
          await this.log('itemRule', rule.id, 'delete', rule.revision + 1, rule.householdId, at);
        }

        // Posten verlieren den Topf wie die Buchungen. Blieben sie stehen,
        // rechnete die nächste Änderung am Einkauf wieder eine Buchung auf
        // den gelöschten Topf.
        const items = (await this.db.purchaseItems.toArray()).filter(
          (item) => alive(item) && item.potId === id,
        );
        for (const item of items) {
          const detached: PurchaseItem = {
            ...item,
            potId: null,
            updatedAt: at,
            revision: item.revision + 1,
          };
          await this.db.purchaseItems.put(detached);
          await this.log(
            'purchaseItem',
            item.id,
            'upsert',
            detached.revision,
            item.householdId,
            at,
          );
        }
      },
    );

    await this.notify();
  }

  // ------------------------------------------------------------- Buchungen

  async listEntries(filter: EntryFilter = {}): Promise<Entry[]> {
    let entries = (await this.db.entries.toArray()).filter(alive);

    if (filter.fromDate) entries = entries.filter((entry) => entry.date >= filter.fromDate!);
    if (filter.toDate) entries = entries.filter((entry) => entry.date <= filter.toDate!);
    if (filter.kind) entries = entries.filter((entry) => entry.kind === filter.kind);
    if (filter.potIds) {
      const wanted = new Set(filter.potIds);
      entries = entries.filter((entry) => entry.potId !== null && wanted.has(entry.potId));
    }
    if (filter.tag) {
      const wanted = filter.tag;
      entries = entries.filter((entry) => hasTag(entry.tags, wanted));
    }
    if (filter.search) {
      const needle = filter.search.trim().toLowerCase();
      if (needle !== '') {
        entries = entries.filter(
          (entry) =>
            (entry.note ?? '').toLowerCase().includes(needle) ||
            (entry.merchant ?? '').toLowerCase().includes(needle) ||
            (entry.address ?? '').toLowerCase().includes(needle),
        );
      }
    }

    entries.sort(byDateDesc);
    return filter.limit ? entries.slice(0, filter.limit) : entries;
  }

  async getEntry(id: string): Promise<Entry | null> {
    const entry = await this.db.entries.get(id);
    return entry && alive(entry) ? entry : null;
  }

  async createEntry(input: NewEntryInput): Promise<Entry> {
    const [entry] = await this.createEntries([input]);
    if (!entry) throw new Error('Buchung konnte nicht angelegt werden.');
    return entry;
  }

  async createEntries(inputs: readonly NewEntryInput[]): Promise<Entry[]> {
    if (inputs.length === 0) return [];
    this.assert('entry.create');
    const household = await this.requireHousehold();
    const principal = this.principalResolver();
    const at = nowIso();

    /**
     * Der Standardtopf als Auffangnetz — hier und nicht im Formular.
     *
     * Der Bon-Import legt Buchungen ohne Umweg über ein Formular an, und die
     * künftige API tut es auch. Eine Regel in der Oberfläche wäre also eine
     * Regel mit Löchern.
     *
     * Zwei Einschränkungen, beide mit Grund: Nur **Ausgaben** — Einnahmen
     * laufen auf den Haushalt, dafür ist der Topf-Schritt beim Erfassen
     * schon immer übersprungen. Und nur, wenn der Topf noch existiert: Auf
     * einen gelöschten Topf zu buchen, wäre schlimmer als kein Topf.
     */
    const fallbackPotId = await this.resolveFallbackPot(household);

    const entries: Entry[] = inputs.map((input) => ({
      id: newId(),
      householdId: household.id,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      potId: input.potId ?? (input.kind === 'expense' ? fallbackPotId : null),
      kind: input.kind,
      amountCents: Math.round(Math.abs(input.amountCents)),
      date: input.date,
      note: clampText(input.note, TEXT_LIMITS.note),
      merchant: clampText(input.merchant, TEXT_LIMITS.merchant),
      address: clampText(input.address, TEXT_LIMITS.address),
      tags: dedupeTags(input.tags ?? []),
      splitGroupId: input.splitGroupId ?? null,
      purchaseId: input.purchaseId ?? null,
      recurringRuleId: input.recurringRuleId ?? null,
      createdBy: principal?.userId ?? 'unbekannt',
    }));

    for (const potId of new Set(entries.map((entry) => entry.potId))) {
      await this.assertPotOpen(potId);
    }

    await this.db.transaction('rw', this.db.entries, this.db.changeLog, async () => {
      await this.db.entries.bulkAdd(entries);
      for (const entry of entries) {
        await this.log('entry', entry.id, 'upsert', entry.revision, entry.householdId);
      }
    });

    await this.notify();
    return entries;
  }

  async updateEntry(id: string, patch: Partial<NewEntryInput>): Promise<Entry> {
    const entry = await this.getEntry(id);
    if (!entry) throw new Error('Buchung nicht gefunden.');
    this.assert('entry.edit.any', { ownerId: entry.createdBy, householdId: entry.householdId });

    // Nur prüfen, wenn sich der Topf tatsächlich ändert — eine Buchung, die
    // schon vor der Sperre auf diesem Topf stand, darf weiter bearbeitet
    // werden (Notiz, Betrag), nur nicht auf einen neuen gesperrten Topf
    // wandern.
    if (patch.potId !== undefined && patch.potId !== entry.potId) {
      await this.assertPotOpen(patch.potId);
    }

    const updated: Entry = {
      ...entry,
      ...patch,
      amountCents:
        patch.amountCents === undefined
          ? entry.amountCents
          : Math.round(Math.abs(patch.amountCents)),
      note: patch.note === undefined ? entry.note : clampText(patch.note, TEXT_LIMITS.note),
      merchant:
        patch.merchant === undefined
          ? entry.merchant
          : clampText(patch.merchant, TEXT_LIMITS.merchant),
      address:
        patch.address === undefined
          ? (entry.address ?? null)
          : clampText(patch.address, TEXT_LIMITS.address),
      // Beim Bearbeiten greift der Standardtopf **nicht**: Wer hier
      // ausdrücklich „Kein Topf" wählt, meint das auch. Der Auffangnetz-Fall
      // ist das Anlegen.
      tags: patch.tags === undefined ? dedupeTags(entry.tags ?? []) : dedupeTags(patch.tags),
      updatedAt: nowIso(),
      revision: entry.revision + 1,
    };

    await this.db.transaction('rw', this.db.entries, this.db.changeLog, async () => {
      await this.db.entries.put(updated);
      await this.log('entry', updated.id, 'upsert', updated.revision, updated.householdId);
    });

    await this.notify();
    return updated;
  }

  async deleteEntry(id: string): Promise<void> {
    const entry = await this.getEntry(id);
    if (!entry) return;
    this.assert('entry.edit.any', { ownerId: entry.createdBy, householdId: entry.householdId });

    const at = nowIso();
    await this.db.transaction(
      'rw',
      this.db.entries,
      this.db.receipts,
      this.db.changeLog,
      async () => {
        await this.db.entries.put({
          ...entry,
          deletedAt: at,
          updatedAt: at,
          revision: entry.revision + 1,
        });
        await this.log('entry', entry.id, 'delete', entry.revision + 1, entry.householdId);

        // Ein Beleg ohne Buchung belegt nichts mehr — und wird hart gelöscht
        // wie in `deleteReceipt`: Ein weich gelöschtes Bild belegte seinen
        // Platz für immer, unsichtbar für die Speicheranzeige.
        const receipts = await this.db.receipts.where('entryId').equals(id).toArray();
        for (const receipt of receipts) {
          await this.db.receipts.delete(receipt.id);
          await this.log(
            'receipt',
            receipt.id,
            'delete',
            receipt.revision + 1,
            receipt.householdId,
          );
        }
      },
    );

    await this.notify();
  }

  // ------------------------------------------------------------------ Tags

  /**
   * Benennt einen Tag in allen Buchungen um und gibt zurück, wie viele
   * angefasst wurden.
   *
   * Hier und nicht in der Oberfläche, aus zwei Gründen: Es ist **eine**
   * Transaktion (die Hälfte umbenannt wäre schlimmer als nichts), und jede
   * berührte Buchung braucht ihre Zeile in der Outbox, sonst fehlt sie später
   * beim Sync.
   *
   * Trägt eine Buchung Quell- **und** Zieltag, bleibt nach dem Umbenennen
   * einer übrig — das entscheidet `dedupeTags`, damit es nur eine Regel gibt.
   */
  async renameTag(from: string, to: string): Promise<number> {
    // Bewusst ohne `ownerId`: Die Operation fasst auch fremde Buchungen an,
    // also braucht sie das Recht auf fremde Buchungen.
    this.assert('entry.edit.any');
    const target = normalizeTag(to);
    if (target === null) throw new Error('Der neue Name ist leer.');
    if (tagKey(from) === tagKey(target)) return 0;

    const at = nowIso();
    let touched = 0;

    const rename = (tags: readonly string[]) =>
      dedupeTags(tags.map((tag) => (tagKey(tag) === tagKey(from) ? target : tag)));

    await this.db.transaction(
      'rw',
      [this.db.entries, this.db.purchases, this.db.purchaseItems, this.db.changeLog],
      async () => {
        await this.retagPurchases(from, rename, at);
        const entries = (await this.db.entries.toArray()).filter(alive);
        for (const entry of entries) {
          if (!hasTag(entry.tags, from)) continue;
          const updated: Entry = {
            ...entry,
            tags: rename(entry.tags ?? []),
            updatedAt: at,
            revision: entry.revision + 1,
          };
          await this.db.entries.put(updated);
          await this.log('entry', updated.id, 'upsert', updated.revision, updated.householdId);
          touched += 1;
        }
      },
    );

    if (touched > 0) await this.notify();
    return touched;
  }

  /**
   * Nimmt einen Tag aus allen Buchungen. Die Buchungen bleiben — einen Tag zu
   * löschen ist eine Ordnungsfrage und keine Aufforderung, Historie
   * wegzuwerfen.
   */
  async deleteTag(tag: string): Promise<number> {
    this.assert('entry.edit.any');
    const at = nowIso();
    let touched = 0;

    await this.db.transaction(
      'rw',
      [this.db.entries, this.db.purchases, this.db.purchaseItems, this.db.changeLog],
      async () => {
        await this.retagPurchases(tag, (tags) => removeTag([...tags], tag), at);
        const entries = (await this.db.entries.toArray()).filter(alive);
        for (const entry of entries) {
          if (!hasTag(entry.tags, tag)) continue;
          const updated: Entry = {
            ...entry,
            tags: removeTag(entry.tags ?? [], tag),
            updatedAt: at,
            revision: entry.revision + 1,
          };
          await this.db.entries.put(updated);
          await this.log('entry', updated.id, 'upsert', updated.revision, updated.householdId);
          touched += 1;
        }
      },
    );

    if (touched > 0) await this.notify();
    return touched;
  }

  // ---------------------------------------------------------------- Regeln

  async listRecurringRules(): Promise<RecurringRule[]> {
    return (await this.db.recurringRules.toArray()).filter(alive);
  }

  async createRecurringRule(input: NewRecurringRuleInput): Promise<RecurringRule> {
    this.assert('recurring.manage');
    const household = await this.requireHousehold();
    await this.assertPotOpen(input.potId);
    const at = nowIso();

    const rule: RecurringRule = {
      id: newId(),
      householdId: household.id,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      potId: input.potId,
      kind: input.kind,
      amountCents: Math.round(Math.abs(input.amountCents)),
      note: clampText(input.note, TEXT_LIMITS.note),
      freq: input.freq,
      interval: input.interval,
      dayOfMonth: input.dayOfMonth ?? null,
      weekday: input.weekday ?? null,
      month: input.month ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      lastMaterializedDate: null,
      paused: input.paused ?? false,
    };

    await this.db.transaction('rw', this.db.recurringRules, this.db.changeLog, async () => {
      await this.db.recurringRules.add(rule);
      await this.log('recurringRule', rule.id, 'upsert', rule.revision, rule.householdId);
    });

    await this.notify();
    return rule;
  }

  async updateRecurringRule(
    id: string,
    patch: Partial<NewRecurringRuleInput>,
  ): Promise<RecurringRule> {
    this.assert('recurring.manage');
    const rule = await this.db.recurringRules.get(id);
    if (!rule || !alive(rule)) throw new Error('Regel nicht gefunden.');
    if (patch.potId !== undefined && patch.potId !== rule.potId) {
      await this.assertPotOpen(patch.potId);
    }

    const updated: RecurringRule = {
      ...rule,
      ...patch,
      amountCents:
        patch.amountCents === undefined
          ? rule.amountCents
          : Math.round(Math.abs(patch.amountCents)),
      note: patch.note === undefined ? rule.note : clampText(patch.note, TEXT_LIMITS.note),
      updatedAt: nowIso(),
      revision: rule.revision + 1,
    };

    await this.db.transaction('rw', this.db.recurringRules, this.db.changeLog, async () => {
      await this.db.recurringRules.put(updated);
      await this.log('recurringRule', updated.id, 'upsert', updated.revision, updated.householdId);
    });

    await this.notify();
    return updated;
  }

  async setRecurringRulePaused(id: string, paused: boolean): Promise<RecurringRule> {
    return this.updateRecurringRule(id, { paused });
  }

  async deleteRecurringRule(id: string): Promise<void> {
    this.assert('recurring.manage');
    const rule = await this.db.recurringRules.get(id);
    if (!rule || !alive(rule)) return;

    const at = nowIso();
    await this.db.transaction('rw', this.db.recurringRules, this.db.changeLog, async () => {
      await this.db.recurringRules.put({
        ...rule,
        deletedAt: at,
        updatedAt: at,
        revision: rule.revision + 1,
      });
      await this.log('recurringRule', rule.id, 'delete', rule.revision + 1, rule.householdId);
    });

    await this.notify();
  }

  /**
   * Erzeugt alle fälligen Buchungen. Läuft beim App-Start und ist idempotent:
   * `lastMaterializedDate` wird in derselben Transaktion fortgeschrieben wie
   * die Buchungen. Bricht die Transaktion ab, wird beim nächsten Start erneut
   * versucht — doppelte Buchungen entstehen nicht.
   */
  async materializeRecurringRules(today: IsoDate = todayIso()): Promise<number> {
    const rules = await this.listRecurringRules();
    if (rules.length === 0) return 0;

    const household = await this.getHousehold();
    if (!household) return 0;

    const principal = this.principalResolver();
    let created = 0;
    const at = nowIso();

    // Dasselbe Auffangnetz wie beim Erfassen: Eine wiederkehrende Ausgabe
    // ohne Topf landet im Standardtopf, wenn es einen gibt. Der Topf wird
    // vorab geprüft, weil in der Transaktion kein zweiter Lesezugriff auf
    // `pots` erlaubt ist — die Tabelle steht nicht in ihrer Liste.
    const fallbackPotId = await this.resolveFallbackPot(household);
    const lockedPotIds = new Set(
      (await this.listPots({ includeArchived: true }))
        .filter((pot) => pot.lockedAt !== null)
        .map((pot) => pot.id),
    );

    await this.db.transaction(
      'rw',
      this.db.entries,
      this.db.recurringRules,
      this.db.changeLog,
      async () => {
        for (const stale of rules) {
          // Frisch in der Transaktion gelesen: Laufen zwei Tabs gleichzeitig
          // an, sieht der zweite das fortgeschriebene `lastMaterializedDate`
          // des ersten und erzeugt nichts doppelt. Mit dem vorab gelesenen
          // Stand buchten beide dieselben Termine.
          const rule = await this.db.recurringRules.get(stale.id);
          if (!rule || !alive(rule)) continue;

          // Eine Regel auf einen inzwischen gesperrten Sparziel-Topf läuft
          // nicht weiter — `lastMaterializedDate` bleibt stehen, damit sie
          // von dort fortsetzt, falls der Topf je entsperrt wird.
          if (rule.potId !== null && lockedPotIds.has(rule.potId)) continue;

          const result = materializeRule(rule, today);
          if (!result) continue;

          const entries: Entry[] = result.entries.map((input) => ({
            id: newId(),
            householdId: household.id,
            createdAt: at,
            updatedAt: at,
            revision: 1,
            deletedAt: null,
            potId: input.potId ?? (input.kind === 'expense' ? fallbackPotId : null),
            kind: input.kind,
            amountCents: input.amountCents,
            date: input.date,
            note: clampText(input.note, TEXT_LIMITS.note),
            merchant: null,
            address: null,
            // Wiederkehrende Regeln tragen selbst noch keine Tags — offen und
            // in STATE.md notiert, nicht vergessen.
            tags: [],
            splitGroupId: null,
            // Eine Regel erzeugt eine Summe, keinen Einkauf.
            purchaseId: null,
            recurringRuleId: rule.id,
            createdBy: principal?.userId ?? 'unbekannt',
          }));

          await this.db.entries.bulkAdd(entries);
          for (const entry of entries) {
            await this.log('entry', entry.id, 'upsert', entry.revision, entry.householdId);
          }

          const updatedRule: RecurringRule = {
            ...rule,
            lastMaterializedDate: result.lastMaterializedDate,
            updatedAt: at,
            revision: rule.revision + 1,
          };
          await this.db.recurringRules.put(updatedRule);
          await this.log(
            'recurringRule',
            rule.id,
            'upsert',
            updatedRule.revision,
            rule.householdId,
          );

          created += entries.length;
        }
      },
    );

    if (created > 0) await this.notify();
    return created;
  }

  // --------------------------------------------------------------- Einkäufe

  /**
   * Ein eingelesener Bon.
   *
   * Einkauf, Posten und Buchungen entstehen in **einer** Transaktion. Ginge
   * das in drei Schritten, hinterließe ein Abbruch Buchungen ohne Einkauf
   * oder Posten ohne Buchungen — und beides sähe in der Liste aus wie ein
   * richtiger Einkauf.
   *
   * Die Buchungen rechnet `planPurchaseEntries`; hier steht nur, wie sie in
   * die Datenbank kommen.
   */
  async createPurchase(input: NewPurchaseInput): Promise<{ purchase: Purchase; entries: Entry[] }> {
    this.assert('entry.create');
    const household = await this.requireHousehold();
    const principal = this.principalResolver();
    const at = nowIso();

    const purchase: Purchase = {
      id: newId(),
      householdId: household.id,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      merchant: clampText(input.merchant, TEXT_LIMITS.merchant),
      date: input.date,
      totalCents: input.totalCents,
      quality: input.quality,
      tags: household.tagsEnabled ? dedupeTags(input.tags ?? []) : [],
    };

    const items: PurchaseItem[] = input.items.map((item, index) => ({
      id: newId(),
      householdId: household.id,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      purchaseId: purchase.id,
      label: clampText(item.label, TEXT_LIMITS.itemLabel) ?? '—',
      // Nicht über `Math.abs`: Das Vorzeichen ist hier die Information.
      amountCents: Math.round(item.amountCents),
      quantity: item.quantity ?? null,
      potId: item.potId ?? null,
      tags: dedupeTags(item.tags ?? []),
      sortIndex: index,
    }));

    // Dieselbe Schreibsperre wie in `createEntries` — der Bon-Import ist der
    // zweite Weg, auf dem eine Buchung sonst an ihr vorbeikäme.
    for (const potId of new Set(items.map((item) => item.potId))) {
      await this.assertPotOpen(potId);
    }

    const plan = planPurchaseEntries(purchase, items, [], {
      tagsEnabled: household.tagsEnabled,
      purchaseTags: purchase.tags,
    });

    const fallbackPotId = await this.resolveFallbackPot(household);
    const entries: Entry[] = plan.create.map((entry) => ({
      id: newId(),
      householdId: household.id,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      potId: entry.potId ?? (entry.kind === 'expense' ? fallbackPotId : null),
      kind: entry.kind,
      amountCents: entry.amountCents,
      date: entry.date,
      note: clampText(entry.note, TEXT_LIMITS.note),
      merchant: clampText(entry.merchant, TEXT_LIMITS.merchant),
      address: clampText(entry.address ?? null, TEXT_LIMITS.address),
      tags: entry.tags ?? [],
      splitGroupId: entry.splitGroupId ?? null,
      purchaseId: purchase.id,
      recurringRuleId: null,
      createdBy: principal?.userId ?? 'unbekannt',
    }));

    await this.db.transaction(
      'rw',
      this.db.purchases,
      this.db.purchaseItems,
      this.db.entries,
      this.db.changeLog,
      async () => {
        await this.db.purchases.add(purchase);
        await this.log('purchase', purchase.id, 'upsert', 1, household.id, at);

        await this.db.purchaseItems.bulkAdd(items);
        for (const item of items) {
          await this.log('purchaseItem', item.id, 'upsert', 1, household.id, at);
        }

        if (entries.length > 0) {
          await this.db.entries.bulkAdd(entries);
          for (const entry of entries) {
            await this.log('entry', entry.id, 'upsert', 1, household.id, at);
          }
        }
      },
    );

    await this.notify();
    return { purchase, entries };
  }

  /**
   * Topf oder Tags eines Postens ändern und die Buchungen nachziehen.
   *
   * Die Reihenfolge in der Transaktion ist nicht beliebig: Der Beleg wird
   * **umgehängt, bevor** eine Buchung verschwindet. `deleteEntry` nimmt die
   * Belege seiner Buchung mit, und wenn gerade der letzte Posten aus der
   * Buchung wandert, an der der Bon hängt, wäre er sonst weg.
   */
  async updatePurchaseItem(
    id: string,
    patch: { potId?: string | null; tags?: string[] },
  ): Promise<Entry[]> {
    const item = await this.db.purchaseItems.get(id);
    if (!item || !alive(item)) throw new Error('Posten nicht gefunden.');
    this.assert('entry.edit.any', {
      householdId: item.householdId,
      ownerId: await this.purchaseOwner(item.purchaseId),
    });
    if (patch.potId !== undefined && patch.potId !== item.potId) {
      await this.assertPotOpen(patch.potId);
    }

    const household = await this.requireHousehold();
    const at = nowIso();
    const principal = this.principalResolver();

    const purchase = await this.db.purchases.get(item.purchaseId);
    if (!purchase || !alive(purchase)) throw new Error('Einkauf nicht gefunden.');

    const geaendert: PurchaseItem = {
      ...item,
      potId: patch.potId === undefined ? item.potId : patch.potId,
      tags: patch.tags === undefined ? item.tags : dedupeTags(patch.tags),
      updatedAt: at,
      revision: item.revision + 1,
    };

    const alle = (await this.db.purchaseItems.where('purchaseId').equals(purchase.id).toArray())
      .filter(alive)
      .map((candidate) => (candidate.id === geaendert.id ? geaendert : candidate));

    const bestehende = (await this.db.entries.toArray())
      .filter(alive)
      .filter((entry) => entry.purchaseId === purchase.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const plan = planPurchaseEntries(purchase, alle, bestehende, {
      tagsEnabled: household.tagsEnabled,
      purchaseTags: purchase.tags ?? [],
    });

    const fallbackPotId = await this.resolveFallbackPot(household);
    const neue: Entry[] = plan.create.map((entry) => ({
      id: newId(),
      householdId: household.id,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      potId: entry.potId ?? (entry.kind === 'expense' ? fallbackPotId : null),
      kind: entry.kind,
      amountCents: entry.amountCents,
      date: entry.date,
      note: clampText(entry.note, TEXT_LIMITS.note),
      merchant: clampText(entry.merchant, TEXT_LIMITS.merchant),
      address: clampText(entry.address ?? null, TEXT_LIMITS.address),
      tags: entry.tags ?? [],
      splitGroupId: entry.splitGroupId ?? null,
      purchaseId: purchase.id,
      recurringRuleId: null,
      createdBy: principal?.userId ?? 'unbekannt',
    }));

    const byId = new Map(bestehende.map((entry) => [entry.id, entry]));
    const geaenderte: Entry[] = [];
    for (const change of plan.update) {
      const vorher = byId.get(change.id);
      if (!vorher) continue;
      geaenderte.push({
        ...vorher,
        potId: change.potId,
        kind: change.kind,
        amountCents: change.amountCents,
        note: clampText(change.note, TEXT_LIMITS.note),
        tags: change.tags,
        splitGroupId: change.splitGroupId,
        updatedAt: at,
        revision: vorher.revision + 1,
      });
    }

    await this.db.transaction(
      'rw',
      this.db.purchaseItems,
      this.db.entries,
      this.db.receipts,
      this.db.changeLog,
      async () => {
        await this.db.purchaseItems.put(geaendert);
        await this.log(
          'purchaseItem',
          geaendert.id,
          'upsert',
          geaendert.revision,
          household.id,
          at,
        );

        if (neue.length > 0) {
          await this.db.entries.bulkAdd(neue);
          for (const entry of neue) {
            await this.log('entry', entry.id, 'upsert', 1, household.id, at);
          }
        }

        for (const entry of geaenderte) {
          await this.db.entries.put(entry);
          await this.log('entry', entry.id, 'upsert', entry.revision, household.id, at);
        }

        // Erst umhängen, dann löschen — die Reihenfolge ist der Punkt.
        const anker = plan.receiptAnchorId ?? neue[0]?.id ?? null;
        if (plan.remove.length > 0 && anker !== null) {
          for (const verlorene of plan.remove) {
            const belege = (
              await this.db.receipts.where('entryId').equals(verlorene).toArray()
            ).filter(alive);
            for (const beleg of belege) {
              const umgehaengt = {
                ...beleg,
                entryId: anker,
                updatedAt: at,
                revision: beleg.revision + 1,
              };
              await this.db.receipts.put(umgehaengt);
              await this.log('receipt', beleg.id, 'upsert', umgehaengt.revision, household.id, at);
            }
          }
        }

        for (const verlorene of plan.remove) {
          const entry = byId.get(verlorene);
          if (!entry) continue;
          await this.db.entries.put({
            ...entry,
            deletedAt: at,
            updatedAt: at,
            revision: entry.revision + 1,
          });
          await this.log('entry', entry.id, 'delete', entry.revision + 1, household.id, at);
        }
      },
    );

    await this.notify();
    return [...geaenderte, ...neue];
  }

  /** Einkauf, Posten, Buchungen und Beleg. Nicht rückgängig zu machen. */
  async deletePurchase(id: string): Promise<void> {
    const purchase = await this.db.purchases.get(id);
    if (!purchase || !alive(purchase)) return;
    this.assert('entry.edit.any', {
      householdId: purchase.householdId,
      ownerId: await this.purchaseOwner(id),
    });

    const at = nowIso();
    await this.db.transaction(
      'rw',
      this.db.purchases,
      this.db.purchaseItems,
      this.db.entries,
      this.db.receipts,
      this.db.changeLog,
      async () => {
        // In der Transaktion gelesen, damit keine Buchung durchrutscht, die
        // zwischen Lesen und Schreiben dazukam.
        const items = (await this.db.purchaseItems.where('purchaseId').equals(id).toArray()).filter(
          alive,
        );
        const entries = (await this.db.entries.toArray())
          .filter(alive)
          .filter((entry) => entry.purchaseId === id);

        for (const entry of entries) {
          await this.db.entries.put({
            ...entry,
            deletedAt: at,
            updatedAt: at,
            revision: entry.revision + 1,
          });
          await this.log('entry', entry.id, 'delete', entry.revision + 1, purchase.householdId, at);

          // Hart löschen wie in `deleteEntry` und `deleteReceipt`: Der Sinn ist, den Platz
          // freizugeben; die Spur im changeLog genügt für den Sync.
          const belege = await this.db.receipts.where('entryId').equals(entry.id).toArray();
          for (const beleg of belege) {
            await this.db.receipts.delete(beleg.id);
            await this.log(
              'receipt',
              beleg.id,
              'delete',
              beleg.revision + 1,
              purchase.householdId,
              at,
            );
          }
        }

        for (const item of items) {
          await this.db.purchaseItems.put({
            ...item,
            deletedAt: at,
            updatedAt: at,
            revision: item.revision + 1,
          });
          await this.log(
            'purchaseItem',
            item.id,
            'delete',
            item.revision + 1,
            purchase.householdId,
            at,
          );
        }

        await this.db.purchases.put({
          ...purchase,
          deletedAt: at,
          updatedAt: at,
          revision: purchase.revision + 1,
        });
        await this.log(
          'purchase',
          purchase.id,
          'delete',
          purchase.revision + 1,
          purchase.householdId,
          at,
        );
      },
    );

    await this.notify();
  }

  // ----------------------------------------------------------- Zuordnungen

  async listItemRules(): Promise<ItemRule[]> {
    const rules = await this.db.itemRules.toArray();
    return rules.filter(alive);
  }

  async rememberItemRule(keyword: string, potId: string): Promise<ItemRule> {
    this.assert('entry.create');
    const household = await this.requireHousehold();
    const normalized = clampText(keyword, TEXT_LIMITS.keyword);
    if (normalized === null) throw new Error('Leeres Schlagwort.');
    await this.assertPotOpen(potId);

    const at = nowIso();
    // Dasselbe Schlagwort überschreibt seine Zuordnung, statt eine zweite
    // anzulegen: Bei zwei Regeln für ein Wort entschiede die Reihenfolge, und
    // das ließe sich niemandem erklären.
    const existing = (await this.db.itemRules.where('keyword').equals(normalized).toArray()).find(
      (rule) => alive(rule),
    );

    const rule: ItemRule = existing
      ? { ...existing, potId, updatedAt: at, revision: existing.revision + 1 }
      : {
          id: newId(),
          householdId: household.id,
          createdAt: at,
          updatedAt: at,
          revision: 1,
          deletedAt: null,
          keyword: normalized,
          potId,
        };

    await this.db.transaction('rw', this.db.itemRules, this.db.changeLog, async () => {
      await this.db.itemRules.put(rule);
      await this.log('itemRule', rule.id, 'upsert', rule.revision, rule.householdId);
    });

    await this.notify();
    return rule;
  }

  async forgetItemRule(id: string): Promise<void> {
    const rule = await this.db.itemRules.get(id);
    if (!rule) return;
    this.assert('entry.create');

    const at = nowIso();
    const deleted: ItemRule = {
      ...rule,
      deletedAt: at,
      updatedAt: at,
      revision: rule.revision + 1,
    };

    await this.db.transaction('rw', this.db.itemRules, this.db.changeLog, async () => {
      await this.db.itemRules.put(deleted);
      await this.log('itemRule', deleted.id, 'delete', deleted.revision, deleted.householdId);
    });

    await this.notify();
  }

  // ---------------------------------------------------------------- Belege

  async listReceipts(entryId?: string): Promise<ReceiptMeta[]> {
    const all = (await this.db.receipts.toArray()).filter(alive);
    const filtered = entryId ? all.filter((receipt) => receipt.entryId === entryId) : all;
    return filtered.map(stripBlobs);
  }

  async addReceipt(entryId: string, upload: ReceiptUpload): Promise<ReceiptMeta> {
    this.assert('receipt.upload');
    const entry = await this.getEntry(entryId);
    if (!entry) throw new Error('Buchung nicht gefunden.');

    const at = nowIso();
    const receipt: Receipt = {
      id: newId(),
      householdId: entry.householdId,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      deletedAt: null,
      entryId,
      filename: clampText(upload.filename, TEXT_LIMITS.filename) ?? 'beleg',
      mime: upload.mime,
      byteSize: upload.blob.size,
      blob: upload.blob,
      thumbnail: upload.thumbnail,
    };

    await this.db.transaction('rw', this.db.receipts, this.db.changeLog, async () => {
      await this.db.receipts.add(receipt);
      await this.log('receipt', receipt.id, 'upsert', receipt.revision, receipt.householdId);
    });

    await this.notify();
    return stripBlobs(receipt);
  }

  async getReceipt(id: string): Promise<Receipt | null> {
    const receipt = await this.db.receipts.get(id);
    return receipt && alive(receipt) ? receipt : null;
  }

  async deleteReceipt(id: string): Promise<void> {
    this.assert('receipt.delete');
    const receipt = await this.getReceipt(id);
    if (!receipt) return;

    const at = nowIso();
    await this.db.transaction('rw', this.db.receipts, this.db.changeLog, async () => {
      // Hart löschen: Der Sinn des Löschens ist, den Platz freizugeben.
      // Die Spur im changeLog genügt für den späteren Sync.
      await this.db.receipts.delete(id);
      await this.log('receipt', id, 'delete', receipt.revision + 1, receipt.householdId, at);
    });

    await this.notify();
  }

  async receiptStorageStats(): Promise<ReceiptStorageStats> {
    const receipts = (await this.db.receipts.toArray()).filter(alive);
    return {
      count: receipts.length,
      byteSize: receipts.reduce((total, receipt) => total + receipt.byteSize, 0),
    };
  }

  /**
   * Siehe `BudgetRepository.purgeDeletedReceipts`. Ohne Rechteprüfung, wie
   * `materializeRecurringRules`: Es ist Aufräumen nach einer Regel, die schon
   * beim Löschen hätte greifen sollen, keine Entscheidung eines Nutzers. Die
   * Outbox-Zeile gab es damals schon (`delete`).
   */
  async purgeDeletedReceipts(): Promise<number> {
    let purged = 0;
    await this.db.transaction('rw', this.db.receipts, async () => {
      const dead = await this.db.receipts
        .filter((receipt) => receipt.deletedAt !== null)
        .primaryKeys();
      await this.db.receipts.bulkDelete(dead);
      purged = dead.length;
    });
    if (purged > 0) await this.notify();
    return purged;
  }

  // ----------------------------------------------------------- Export/Import

  async exportAll(options: { includeReceipts: boolean }): Promise<ExportFile> {
    this.assert('data.export');
    const household = await this.requireHousehold();
    const [users, pots, entries, recurringRules, receipts, itemRules, purchases, purchaseItems] =
      await Promise.all([
        this.listUsers(),
        this.listPots({ includeArchived: true }),
        this.listEntries(),
        this.listRecurringRules(),
        this.db.receipts.toArray(),
        this.listItemRules(),
        this.db.purchases.toArray(),
        this.db.purchaseItems.toArray(),
      ]);

    const receiptExports: ReceiptExport[] = options.includeReceipts
      ? await Promise.all(
          receipts.filter(alive).map(async (receipt) => ({
            ...stripBlobs(receipt),
            dataBase64: await blobToBase64(receipt.blob),
            thumbnailBase64: receipt.thumbnail ? await blobToBase64(receipt.thumbnail) : null,
          })),
        )
      : [];

    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: nowIso(),
      app: 'budget-calculator',
      household,
      users,
      pots,
      entries,
      recurringRules,
      receipts: receiptExports,
      itemRules,
      // Ohne die Posten wäre die Sicherung eine Stufe gröber als der Bestand:
      // Die Buchungen kämen zurück, die Zeilen dahinter nicht.
      purchases: purchases.filter(alive),
      purchaseItems: purchaseItems.filter(alive),
    };
  }

  /**
   * Import.
   *
   * - `replace` verwirft alles Lokale. Für Gerätewechsel und Wiederherstellung.
   * - `merge` führt über die `id` zusammen; bei Konflikt gewinnt die höhere
   *   `revision`. Genau dafür wird `revision` überhaupt mitgeführt.
   */
  async importAll(
    file: ExportFile,
    mode: 'replace' | 'merge',
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    this.assert('data.import');
    return this.writeImport(file, mode, options);
  }

  /**
   * Der eigentliche Schreibvorgang — von `importAll` und `restoreFromBackup` benutzt.
   *
   * Vor dem Schreiben passieren zwei Dinge, beide in `lib/domain/backup.ts`:
   * Eine Sicherung aus einem fremden Haushalt wird nur mit Zustimmung
   * (`adoptInto`) übernommen, und Verweise ins Leere werden gelöst und gezählt.
   * Jeder geschriebene Datensatz bekommt seine Outbox-Zeile — vorher war es
   * eine einzige für den ganzen Import.
   */
  private async writeImport(
    incoming: ExportFile,
    mode: 'replace' | 'merge',
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    const local = await this.getHousehold();
    let file = incoming;
    let adopted = false;
    if (mode === 'merge' && local !== null && local.id !== incoming.household.id) {
      if (options.adoptInto !== local.id) {
        throw new ForeignHouseholdError(incoming.household.name, local.name);
      }
      file = adoptIntoHousehold(incoming, local.id);
      adopted = true;
    }

    const result: ImportResult = {
      mode,
      pots: 0,
      entries: 0,
      recurringRules: 0,
      receipts: 0,
      itemRules: 0,
      purchases: 0,
      purchaseItems: 0,
      skipped: 0,
      repaired: 0,
    };
    const at = nowIso();

    await this.db.transaction('rw', this.allTables(), async () => {
      // Beim Ersetzen zählt nur die Datei; beim Zusammenführen darf ein
      // Verweis auch auf etwas zeigen, das nur lokal existiert.
      const known =
        mode === 'merge'
          ? {
              potIds: (await this.db.pots.toArray()).filter(alive).map((pot) => pot.id),
              entryIds: (await this.db.entries.toArray()).filter(alive).map((entry) => entry.id),
              purchaseIds: (await this.db.purchases.toArray())
                .filter(alive)
                .map((purchase) => purchase.id),
            }
          : {};
      const repairedFile = repairReferences(file, known);
      file = repairedFile.file;
      result.repaired = repairedFile.repaired;

      const householdId = adopted ? local!.id : file.household.id;
      const write = async <T extends { id: string; revision: number }>(
        table: WritableTable<NoInfer<T>>,
        entity: ChangeLogEntry['entity'],
        record: T,
      ): Promise<boolean> => {
        if (mode === 'merge' && !(await this.shouldWrite(table, record))) return false;
        await table.put(record);
        await this.log(entity, record.id, 'upsert', record.revision, householdId, at);
        return true;
      };

      // Eine Sicherung ohne Belege (Export mit „ohne Belege") soll beim
      // Ersetzen die vorhandenen nicht mitnehmen — sonst waren alle Bilder
      // weg, ohne dass jemand danach gefragt hätte. Behalten wird, was an
      // einer Buchung hängt, die die Datei wieder mitbringt.
      const keptReceipts: Receipt[] = [];
      if (mode === 'replace') {
        const incomingReceiptIds = new Set(file.receipts.map((receipt) => receipt.id));
        const entryIds = new Set(file.entries.map((entry) => entry.id));
        for (const receipt of await this.db.receipts.toArray()) {
          if (
            alive(receipt) &&
            !incomingReceiptIds.has(receipt.id) &&
            entryIds.has(receipt.entryId)
          ) {
            keptReceipts.push(receipt);
          }
        }
        // Auch die Outbox: Sie zeigte sonst auf Datensätze, die es nicht mehr gibt.
        await Promise.all(this.allTables().map((table) => table.clear()));
      }

      if (!adopted) {
        if (await write(this.db.households, 'household', file.household)) {
          // Ohne Zählfeld — der Haushalt ist einer.
        }
        for (const user of file.users) await write(this.db.users, 'user', user);
      }

      const count = async <T extends { id: string; revision: number }>(
        table: WritableTable<NoInfer<T>>,
        entity: ChangeLogEntry['entity'],
        records: readonly T[],
        key: 'pots' | 'entries' | 'recurringRules' | 'itemRules' | 'purchases' | 'purchaseItems',
      ): Promise<void> => {
        for (const record of records) {
          if (await write(table, entity, record)) result[key] += 1;
          else result.skipped += 1;
        }
      };

      await count(this.db.pots, 'pot', file.pots, 'pots');
      await count(this.db.entries, 'entry', file.entries, 'entries');
      await count(this.db.recurringRules, 'recurringRule', file.recurringRules, 'recurringRules');
      await count(this.db.itemRules, 'itemRule', file.itemRules, 'itemRules');
      await count(this.db.purchases, 'purchase', file.purchases, 'purchases');
      await count(this.db.purchaseItems, 'purchaseItem', file.purchaseItems, 'purchaseItems');

      for (const receiptExport of file.receipts) {
        const { dataBase64, thumbnailBase64, ...meta } = receiptExport;
        const receipt: Receipt = {
          ...meta,
          blob: base64ToBlob(dataBase64, meta.mime),
          // Die Vorschau ist immer ein JPEG (`lib/ui/thumbnail.ts`), nicht
          // vom Typ des Originals.
          thumbnail: thumbnailBase64 ? base64ToBlob(thumbnailBase64, 'image/jpeg') : null,
        };
        if (await write(this.db.receipts, 'receipt', receipt)) result.receipts += 1;
        else result.skipped += 1;
      }
      for (const receipt of keptReceipts) await this.db.receipts.put(receipt);
    });

    await this.notify();
    return result;
  }

  async wipeAll(): Promise<void> {
    this.assert('settings.manage');
    await this.db.transaction('rw', this.allTables(), async () => {
      await Promise.all([
        this.db.households.clear(),
        this.db.users.clear(),
        this.db.pots.clear(),
        this.db.entries.clear(),
        this.db.recurringRules.clear(),
        this.db.receipts.clear(),
        this.db.itemRules.clear(),
        this.db.purchases.clear(),
        this.db.purchaseItems.clear(),
        this.db.changeLog.clear(),
      ]);
    });
    await this.notify();
  }

  async pendingChangeCount(): Promise<number> {
    return this.db.changeLog.count();
  }

  // --------------------------------------------------------------- intern

  private assert(
    permission: Parameters<typeof assertCan>[1],
    resource?: Parameters<typeof assertCan>[2],
  ): void {
    assertCan(this.principalResolver(), permission, resource);
  }

  /** Alle Tabellen — für Transaktionen, die den gesamten Bestand anfassen. */
  private allTables(): Table[] {
    return [
      this.db.households,
      this.db.users,
      this.db.pots,
      this.db.entries,
      this.db.recurringRules,
      this.db.receipts,
      this.db.itemRules,
      this.db.purchases,
      this.db.purchaseItems,
      this.db.changeLog,
    ] as unknown as Table[];
  }

  /**
   * Räumt den Standardtopf, wenn er auf diesen Topf zeigt.
   *
   * Läuft **in der Transaktion des Aufrufers**: Ein Abbruch dazwischen würde
   * sonst einen Standardtopf hinterlassen, den es nicht mehr gibt. Auch beim
   * Archivieren — ein Standardtopf, der in keiner Liste mehr steht, wäre ein
   * unsichtbares Ziel für jede Ausgabe ohne Zuordnung.
   */
  private async detachDefaultPot(potId: string, at: string): Promise<void> {
    const household = await this.getHousehold();
    if (!household || household.defaultPotId !== potId) return;

    const updated: Household = {
      ...household,
      defaultPotId: null,
      updatedAt: at,
      revision: household.revision + 1,
    };
    await this.db.households.put(updated);
    await this.log('household', updated.id, 'upsert', updated.revision, updated.id);
  }

  /**
   * Der Standardtopf als Auffangnetz — oder `null`, wenn es ihn nicht mehr
   * gibt. Auf einen gelöschten Topf zu buchen wäre schlimmer als kein Topf.
   *
   * Steht hier und nicht in `createEntries`, weil `createPurchase` denselben
   * Weg nimmt: Der Bon-Import geht an jedem Formular vorbei, und das
   * Auffangnetz darf dort keine Lücke haben.
   */
  private async resolveFallbackPot(household: Household): Promise<string | null> {
    if (household.defaultPotId === null) return null;
    const pot = await this.getPot(household.defaultPotId);
    return pot !== null && pot.lockedAt === null ? household.defaultPotId : null;
  }

  /**
   * Wirft, wenn `potId` auf einen gesperrten Sparziel-Topf zeigt. `null`
   * (keine Zuordnung) ist immer erlaubt.
   *
   * Anders als `archivedAt` — das blendet nur in der Oberfläche aus — ist
   * `lockedAt` eine echte Schreibsperre: Sie gehört ins Repository, nicht in
   * ein ausgeblendetes Formularfeld, sonst käme eine Buchung über einen
   * zweiten Weg (Wiederkehrend, Bon-Import) trotzdem durch.
   */
  private async assertPotOpen(potId: string | null): Promise<void> {
    if (potId === null) return;
    const pot = await this.getPot(potId);
    // Ein gelöschter Topf ist kein Ziel — vorher ließ sich auf eine ID buchen,
    // die es nicht mehr gab, und die Buchung hing dann an nichts.
    if (pot === null) throw new Error('Topf nicht gefunden.');
    if (pot.lockedAt !== null) {
      throw new Error('Dieses Sparziel ist gesperrt — es lässt sich nicht mehr bebuchen.');
    }
  }

  /**
   * Wer einen Einkauf angelegt hat. `Purchase` trägt kein `createdBy` — die
   * Buchungen daraus tun es, und sie entstehen alle im selben Zug.
   *
   * Ohne diese Angabe prüfte `assertCan` nur `entry.edit.any`, und ein
   * Mitglied konnte seinen eigenen Einkauf weder ändern noch löschen.
   */
  private async purchaseOwner(purchaseId: string): Promise<string | null> {
    const entries = (await this.db.entries.toArray()).filter(
      (entry) => alive(entry) && entry.purchaseId === purchaseId,
    );
    return entries[0]?.createdBy ?? null;
  }

  /**
   * Tags an Einkauf und Posten nachziehen — in der Transaktion des Aufrufers.
   *
   * Die Buchungen eines Einkaufs werden aus diesen Tags **neu gerechnet**.
   * Stand der alte Name nur hier noch, brachte die nächste Postenänderung
   * ihn an die Buchungen zurück.
   */
  private async retagPurchases(
    tag: string,
    change: (tags: readonly string[]) => string[],
    at: string,
  ): Promise<void> {
    for (const purchase of await this.db.purchases.toArray()) {
      if (!alive(purchase) || !hasTag(purchase.tags, tag)) continue;
      const updated: Purchase = {
        ...purchase,
        tags: change(purchase.tags ?? []),
        updatedAt: at,
        revision: purchase.revision + 1,
      };
      await this.db.purchases.put(updated);
      await this.log('purchase', updated.id, 'upsert', updated.revision, updated.householdId, at);
    }
    for (const item of await this.db.purchaseItems.toArray()) {
      if (!alive(item) || !hasTag(item.tags, tag)) continue;
      const updated: PurchaseItem = {
        ...item,
        tags: change(item.tags ?? []),
        updatedAt: at,
        revision: item.revision + 1,
      };
      await this.db.purchaseItems.put(updated);
      await this.log(
        'purchaseItem',
        updated.id,
        'upsert',
        updated.revision,
        updated.householdId,
        at,
      );
    }
  }

  private async requireHousehold(): Promise<Household> {
    const household = await this.getHousehold();
    if (!household) throw new Error('Kein Haushalt eingerichtet.');
    return household;
  }

  private async shouldWrite<T extends { id: string; revision: number }>(
    table: { get(id: string): Promise<T | undefined> },
    incoming: T,
  ): Promise<boolean> {
    const existing = await table.get(incoming.id);
    return !existing || existing.revision <= incoming.revision;
  }

  private async log(
    entity: ChangeLogEntry['entity'],
    entityId: string,
    op: ChangeLogEntry['op'],
    revision: number,
    householdId: string,
    at: string = nowIso(),
  ): Promise<void> {
    if (!this.writeChangeLog) return;
    await this.db.changeLog.add({ id: newId(), householdId, entity, entityId, op, revision, at });
  }

  /**
   * Nach jeder Mutation: Cache erneuern, dann benachrichtigen.
   *
   * Bewusst `await`, bevor die aufrufende Methode zurückkehrt — dann gilt nach
   * jedem `await repository.createEntry(...)` bereits der neue Stand. Ein
   * nachgelagertes Neuladen wäre schneller, aber jeder Aufrufer müsste dann
   * mit einem Zwischenzustand rechnen.
   */
  private async notify(): Promise<void> {
    await this.refresh();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * Füllt Felder auf, die es in älteren Installationen noch nicht gab.
 *
 * `Household` liegt als ganzes Objekt in IndexedDB; ein neues Feld ist dort
 * schlicht `undefined`, und eine Dexie-Migration gibt es dafür nicht (die
 * Felder sind nicht indiziert). Ohne diese Stelle wäre `askForPot` bei jedem
 * bestehenden Haushalt `undefined` — und damit falsch, denn `undefined` ist
 * unwahr, der Topf würde stumm nicht mehr abgefragt.
 */
function withHouseholdDefaults(stored: Household): Household {
  return {
    ...stored,
    defaultPotId: stored.defaultPotId ?? null,
    askForPot: stored.askForPot ?? true,
    tagsEnabled: stored.tagsEnabled ?? false,
    fabDefault: stored.fabDefault ?? 'expense',
    fabScopes: stored.fabScopes ?? {},
  };
}

/**
 * Pflichttext: gekürzt wie jeder Freitext (`clampText`), aber leer ist ein
 * Fehler statt `null` — ein Topf ohne Namen ist keiner.
 */
function requireText(value: string, limit: number, message: string): string {
  const text = clampText(value, limit);
  if (text === null) throw new Error(message);
  return text;
}

function alive<T extends { deletedAt: string | null }>(record: T): boolean {
  return record.deletedAt === null;
}

function stripBlobs(receipt: Receipt | ReceiptMeta): ReceiptMeta {
  const { ...rest } = receipt as Receipt;
  delete (rest as Partial<Receipt>).blob;
  delete (rest as Partial<Receipt>).thumbnail;
  return rest as ReceiptMeta;
}

function bySortIndex(a: Pot, b: Pot): number {
  return a.sortIndex - b.sortIndex || a.name.localeCompare(b.name, 'de');
}

function byDateDesc(a: Entry, b: Entry): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}
