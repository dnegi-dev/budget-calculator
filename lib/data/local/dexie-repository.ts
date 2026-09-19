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
import { applyPotKindPreset } from '../../domain/pot-kinds';
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
  NewRecurringRuleInput,
  Pot,
  Receipt,
  ReceiptMeta,
  RecurringRule,
  Role,
  User,
} from '../../domain/types';
import { assertCan, type Principal } from '../../rbac/can';
import { base64ToBlob, blobToBase64 } from '../blobs';
import type {
  BudgetRepository,
  EntryFilter,
  HouseholdSetupInput,
  ImportResult,
  ReceiptStorageStats,
  ReceiptUpload,
  Snapshot,
} from '../repository';

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
    const [household, users, pots, entries, recurringRules, receipts, itemRules] =
      await Promise.all([
        this.getHousehold(),
        this.db.users.toArray(),
        this.db.pots.toArray(),
        this.db.entries.toArray(),
        this.db.recurringRules.toArray(),
        this.db.receipts.toArray(),
        this.db.itemRules.toArray(),
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
      name: input.name.trim(),
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
      displayName: input.displayName?.trim() || 'Ich',
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

    const updated: Household = {
      ...current,
      ...patch,
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
      name: input.name.trim(),
      icon: input.icon ?? '🧺',
      color:
        input.color ?? (DEFAULT_POT_COLORS[existing.length % DEFAULT_POT_COLORS.length] as string),
      sortIndex: input.sortIndex ?? existing.length,
      archivedAt: null,
      ...applyPotKindPreset(input.kind, input.limitCents),
      // Eine abweichende Kombination aus Limit und Übertrag ist erlaubt — das
      // Preset ist nur der Startpunkt.
      carryOver: input.carryOver,
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
    const updated: Pot = {
      ...pot,
      ...patch,
      name: (patch.name ?? pot.name).trim(),
      kind,
      // Limit und Übertrag bleiben frei einstellbar; nur bei 'category' erzwingt
      // das Preset „kein Limit“, weil sonst widersprüchliche Zustände entstehen.
      limitCents: kind === 'category' ? null : limitCents,
      carryOver: patch.carryOver ?? pot.carryOver,
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
      this.db.pots,
      this.db.entries,
      this.db.recurringRules,
      this.db.households,
      this.db.changeLog,
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
            (entry.merchant ?? '').toLowerCase().includes(needle),
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
    const fallbackPotId =
      household.defaultPotId !== null && (await this.getPot(household.defaultPotId)) !== null
        ? household.defaultPotId
        : null;

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
      tags: dedupeTags(input.tags ?? []),
      splitGroupId: input.splitGroupId ?? null,
      recurringRuleId: input.recurringRuleId ?? null,
      createdBy: principal?.userId ?? 'unbekannt',
    }));

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

        // Ein Beleg ohne Buchung belegt nichts mehr.
        const receipts = (await this.db.receipts.where('entryId').equals(id).toArray()).filter(
          alive,
        );
        for (const receipt of receipts) {
          await this.db.receipts.put({
            ...receipt,
            deletedAt: at,
            updatedAt: at,
            revision: receipt.revision + 1,
          });
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

    await this.db.transaction('rw', this.db.entries, this.db.changeLog, async () => {
      const entries = (await this.db.entries.toArray()).filter(alive);
      for (const entry of entries) {
        if (!hasTag(entry.tags, from)) continue;
        const updated: Entry = {
          ...entry,
          tags: dedupeTags(
            (entry.tags ?? []).map((tag) => (tagKey(tag) === tagKey(from) ? target : tag)),
          ),
          updatedAt: at,
          revision: entry.revision + 1,
        };
        await this.db.entries.put(updated);
        await this.log('entry', updated.id, 'upsert', updated.revision, updated.householdId);
        touched += 1;
      }
    });

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

    await this.db.transaction('rw', this.db.entries, this.db.changeLog, async () => {
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
    });

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
    const fallbackPotId =
      household.defaultPotId !== null && (await this.getPot(household.defaultPotId)) !== null
        ? household.defaultPotId
        : null;

    await this.db.transaction(
      'rw',
      this.db.entries,
      this.db.recurringRules,
      this.db.changeLog,
      async () => {
        for (const rule of rules) {
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
            note: input.note ?? null,
            merchant: null,
            // Wiederkehrende Regeln tragen selbst noch keine Tags — offen und
            // in STATE.md notiert, nicht vergessen.
            tags: [],
            splitGroupId: null,
            recurringRuleId: rule.id,
            createdBy: principal?.userId ?? rule.householdId,
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
      filename: upload.filename,
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

  // ----------------------------------------------------------- Export/Import

  async exportAll(options: { includeReceipts: boolean }): Promise<ExportFile> {
    this.assert('data.export');
    const household = await this.requireHousehold();
    const [users, pots, entries, recurringRules, receipts, itemRules] = await Promise.all([
      this.listUsers(),
      this.listPots({ includeArchived: true }),
      this.listEntries(),
      this.listRecurringRules(),
      this.db.receipts.toArray(),
      this.listItemRules(),
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
    };
  }

  /**
   * Import.
   *
   * - `replace` verwirft alles Lokale. Für Gerätewechsel und Wiederherstellung.
   * - `merge` führt über die `id` zusammen; bei Konflikt gewinnt die höhere
   *   `revision`. Genau dafür wird `revision` überhaupt mitgeführt.
   */
  async importAll(file: ExportFile, mode: 'replace' | 'merge'): Promise<ImportResult> {
    this.assert('data.import');
    return this.writeImport(file, mode);
  }

  /** Der eigentliche Schreibvorgang — von `importAll` und `restoreFromBackup` benutzt. */
  private async writeImport(file: ExportFile, mode: 'replace' | 'merge'): Promise<ImportResult> {
    const result: ImportResult = {
      mode,
      pots: 0,
      entries: 0,
      recurringRules: 0,
      receipts: 0,
      skipped: 0,
    };

    await this.db.transaction('rw', this.allTables(), async () => {
      if (mode === 'replace') {
        await Promise.all([
          this.db.households.clear(),
          this.db.users.clear(),
          this.db.pots.clear(),
          this.db.entries.clear(),
          this.db.recurringRules.clear(),
          this.db.receipts.clear(),
          this.db.itemRules.clear(),
        ]);
        await this.db.households.put(file.household);
        await this.db.users.bulkPut(file.users);
      } else {
        const existingHousehold = await this.db.households.get(file.household.id);
        if (!existingHousehold || existingHousehold.revision < file.household.revision) {
          await this.db.households.put(file.household);
        }
        for (const user of file.users) {
          if (await this.shouldWrite(this.db.users, user)) await this.db.users.put(user);
        }
      }

      for (const pot of file.pots) {
        if (mode === 'replace' || (await this.shouldWrite(this.db.pots, pot))) {
          await this.db.pots.put(pot);
          result.pots += 1;
        } else {
          result.skipped += 1;
        }
      }

      for (const entry of file.entries) {
        if (mode === 'replace' || (await this.shouldWrite(this.db.entries, entry))) {
          await this.db.entries.put(entry);
          result.entries += 1;
        } else {
          result.skipped += 1;
        }
      }

      for (const rule of file.recurringRules) {
        if (mode === 'replace' || (await this.shouldWrite(this.db.recurringRules, rule))) {
          await this.db.recurringRules.put(rule);
          result.recurringRules += 1;
        } else {
          result.skipped += 1;
        }
      }

      for (const receiptExport of file.receipts) {
        const { dataBase64, thumbnailBase64, ...meta } = receiptExport;
        const receipt: Receipt = {
          ...meta,
          blob: base64ToBlob(dataBase64, meta.mime),
          thumbnail: thumbnailBase64 ? base64ToBlob(thumbnailBase64, meta.mime) : null,
        };
        if (mode === 'replace' || (await this.shouldWrite(this.db.receipts, receipt))) {
          await this.db.receipts.put(receipt);
          result.receipts += 1;
        } else {
          result.skipped += 1;
        }
      }

      for (const rule of file.itemRules) {
        if (mode === 'replace' || (await this.shouldWrite(this.db.itemRules, rule))) {
          await this.db.itemRules.put(rule);
        }
      }

      await this.log(
        'household',
        file.household.id,
        'upsert',
        file.household.revision,
        file.household.id,
      );
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
