/**
 * Tests gegen eine echte IndexedDB-Implementierung (fake-indexeddb).
 *
 * Geprüft wird, was beim Lesen des Codes nicht sichtbar ist: dass Rechte
 * wirklich im Adapter greifen, dass Soft Deletes nicht zu Datenverlust führen
 * und dass der Merge-Import bei gleichen IDs die richtige Seite gewinnen lässt.
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type BudgetDatabase } from './db';
import { DexieBudgetRepository } from './dexie-repository';
import { PermissionDeniedError, type Principal } from '../../rbac/can';
import { EXPORT_SCHEMA_VERSION, exportFileSchema, TEXT_LIMITS } from '../../domain/schemas';
import type { Role } from '../../domain/types';

let db: BudgetDatabase;
let repo: DexieBudgetRepository;
let principal: Principal | null;
let dbCounter = 0;

async function setup(role: Role = 'admin') {
  dbCounter += 1;
  db = createTestDatabase(`test-${dbCounter}`);
  repo = new DexieBudgetRepository(db, true);
  repo.setPrincipalResolver(() => principal);

  principal = null;
  const { household, user } = await repo.setupHousehold({
    name: 'Testhaushalt',
    currency: 'EUR',
    locale: 'de-DE',
    periodStartDay: 1,
  });
  principal = { userId: user.id, householdId: household.id, role };
  return { household, user };
}

beforeEach(async () => {
  await setup();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Ersteinrichtung', () => {
  it('legt Haushalt und lokalen Admin an', async () => {
    const household = await repo.getHousehold();
    expect(household?.name).toBe('Testhaushalt');
    const user = await repo.getLocalDeviceUser();
    expect(user?.role).toBe('admin');
    expect(user?.isLocalDevice).toBe(true);
    expect(user?.externalSubject).toBeNull();
  });

  it('lässt sich nicht zweimal ausführen', async () => {
    await expect(
      repo.setupHousehold({ name: 'Zweiter', currency: 'EUR', locale: 'de-DE', periodStartDay: 1 }),
    ).rejects.toThrow(/bereits einen Haushalt/);
  });

  it('erlaubt den Abschluss der Einrichtung ohne settings.manage', async () => {
    principal = { ...principal!, role: 'member' };
    const updated = await repo.updateHousehold({
      onboardingCompletedAt: '2026-09-18T00:00:00.000Z',
    });
    expect(updated.onboardingCompletedAt).not.toBeNull();
  });
});

describe('Rechteprüfung im Adapter', () => {
  it('verweigert dem Nutzer das Anlegen von Töpfen', async () => {
    principal = { ...principal!, role: 'member' };
    await expect(
      repo.createPot({ name: 'Sport', kind: 'budget', limitCents: 5_000, carryOver: false }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('verweigert dem Leser das Buchen', async () => {
    principal = { ...principal!, role: 'viewer' };
    await expect(
      repo.createEntry({ potId: null, kind: 'expense', amountCents: 1_000, date: '2026-09-18' }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('lässt den Nutzer eigene Buchungen ändern, aber keine fremden', async () => {
    const own = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 1_000,
      date: '2026-09-18',
    });
    principal = { userId: 'jemand-anders', householdId: principal!.householdId, role: 'member' };
    await expect(repo.updateEntry(own.id, { amountCents: 2_000 })).rejects.toThrow(
      PermissionDeniedError,
    );

    principal = { userId: own.createdBy, householdId: principal.householdId, role: 'member' };
    const updated = await repo.updateEntry(own.id, { amountCents: 2_000 });
    expect(updated.amountCents).toBe(2_000);
  });
});

describe('Töpfe', () => {
  it('wendet das Preset an und lässt Abweichungen zu', async () => {
    const category = await repo.createPot({
      name: 'Sonstiges',
      kind: 'category',
      limitCents: 9_999,
      carryOver: true,
    });
    expect(category.limitCents).toBeNull();

    const envelope = await repo.createPot({
      name: 'Sport',
      kind: 'envelope',
      limitCents: 5_000,
      carryOver: true,
    });
    expect(envelope.carryOver).toBe(true);

    // Abweichung: Budget-Preset, aber Übertrag eingeschaltet.
    const custom = await repo.createPot({
      name: 'Urlaub',
      kind: 'budget',
      limitCents: 10_000,
      carryOver: true,
    });
    expect(custom.kind).toBe('budget');
    expect(custom.carryOver).toBe(true);
  });

  it('erhöht revision bei jeder Änderung', async () => {
    const pot = await repo.createPot({
      name: 'Sport',
      kind: 'budget',
      limitCents: 5_000,
      carryOver: false,
    });
    expect(pot.revision).toBe(1);
    const updated = await repo.updatePot(pot.id, { name: 'Sport & Fitness' });
    expect(updated.revision).toBe(2);
    expect(updated.name).toBe('Sport & Fitness');
  });

  it('archiviert, ohne Buchungen zu verlieren', async () => {
    const pot = await repo.createPot({
      name: 'Sport',
      kind: 'budget',
      limitCents: 5_000,
      carryOver: false,
    });
    await repo.createEntry({
      potId: pot.id,
      kind: 'expense',
      amountCents: 1_000,
      date: '2026-09-18',
    });
    await repo.setPotArchived(pot.id, true);

    expect(await repo.listPots()).toHaveLength(0);
    expect(await repo.listPots({ includeArchived: true })).toHaveLength(1);
    expect(await repo.listEntries()).toHaveLength(1);
  });

  it('löst beim Löschen die Zuordnung, behält aber die Buchung', async () => {
    const pot = await repo.createPot({
      name: 'Sport',
      kind: 'budget',
      limitCents: 5_000,
      carryOver: false,
    });
    await repo.createEntry({
      potId: pot.id,
      kind: 'expense',
      amountCents: 1_000,
      date: '2026-09-18',
    });
    await repo.deletePot(pot.id);

    expect(await repo.getPot(pot.id)).toBeNull();
    const entries = await repo.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.potId).toBeNull();
  });
});

describe('Buchungen', () => {
  it('speichert Beträge immer positiv', async () => {
    const entry = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: -1_250,
      date: '2026-09-18',
    });
    expect(entry.amountCents).toBe(1_250);
  });

  it('filtert nach Zeitraum, Art und Freitext', async () => {
    await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 100,
      date: '2026-08-01',
      merchant: 'Rewe',
    });
    await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 200,
      date: '2026-09-01',
      note: 'Bäcker',
    });
    await repo.createEntry({ potId: null, kind: 'income', amountCents: 300, date: '2026-09-02' });

    expect(await repo.listEntries({ fromDate: '2026-09-01' })).toHaveLength(2);
    expect(await repo.listEntries({ kind: 'income' })).toHaveLength(1);
    expect(await repo.listEntries({ search: 'bäck' })).toHaveLength(1);
    expect(await repo.listEntries({ search: 'rewe' })).toHaveLength(1);
    expect(await repo.listEntries({ limit: 1 })).toHaveLength(1);
  });

  it('löscht per Soft Delete und blendet die Buchung aus', async () => {
    const entry = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 100,
      date: '2026-09-18',
    });
    await repo.deleteEntry(entry.id);
    expect(await repo.getEntry(entry.id)).toBeNull();
    expect(await repo.listEntries()).toHaveLength(0);
    // Der Datensatz existiert noch — sonst könnte ein Sync die Löschung nicht übertragen.
    expect(await db.entries.get(entry.id)).toBeDefined();
  });
});

describe('Wiederkehrende Buchungen', () => {
  it('materialisiert fällige Termine genau einmal', async () => {
    const pot = await repo.createPot({
      name: 'Wohnen',
      kind: 'budget',
      limitCents: 100_000,
      carryOver: false,
    });
    await repo.createRecurringRule({
      potId: pot.id,
      kind: 'expense',
      amountCents: 95_000,
      freq: 'monthly',
      interval: 1,
      dayOfMonth: 1,
      startDate: '2026-07-01',
      note: 'Miete',
    });

    const created = await repo.materializeRecurringRules('2026-09-18');
    expect(created).toBe(3); // Juli, August, September

    const again = await repo.materializeRecurringRules('2026-09-18');
    expect(again).toBe(0);
    expect(await repo.listEntries()).toHaveLength(3);
  });

  it('überspringt pausierte Regeln', async () => {
    const rule = await repo.createRecurringRule({
      potId: null,
      kind: 'income',
      amountCents: 250_000,
      freq: 'monthly',
      interval: 1,
      dayOfMonth: 1,
      startDate: '2026-07-01',
    });
    await repo.setRecurringRulePaused(rule.id, true);
    expect(await repo.materializeRecurringRules('2026-09-18')).toBe(0);
  });
});

describe('Belege', () => {
  it('speichert Blob getrennt von den Metadaten', async () => {
    const entry = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 1_250,
      date: '2026-09-18',
    });
    const blob = new Blob(['kassenzettel'], { type: 'text/plain' });
    const meta = await repo.addReceipt(entry.id, {
      filename: 'zettel.txt',
      mime: 'text/plain',
      blob,
      thumbnail: null,
    });

    expect(meta.byteSize).toBe(blob.size);
    expect('blob' in meta).toBe(false);

    const full = await repo.getReceipt(meta.id);
    expect(await full?.blob.text()).toBe('kassenzettel');

    const stats = await repo.receiptStorageStats();
    expect(stats.count).toBe(1);
    expect(stats.byteSize).toBe(blob.size);
  });

  it('entfernt Belege mit der Buchung', async () => {
    const entry = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 1_250,
      date: '2026-09-18',
    });
    await repo.addReceipt(entry.id, {
      filename: 'zettel.txt',
      mime: 'text/plain',
      blob: new Blob(['x'], { type: 'text/plain' }),
      thumbnail: null,
    });
    await repo.deleteEntry(entry.id);
    expect(await repo.listReceipts()).toHaveLength(0);
  });
});

describe('Textlängen', () => {
  /**
   * Der Fehler, den dieser Test festhält: Das Limit stand nur im
   * Import-Schema. Eine längere Notiz ließ sich speichern und exportieren —
   * und die Sicherung war danach nicht mehr einlesbar.
   */
  it('kürzt eine zu lange Notiz beim Schreiben, damit die Sicherung einlesbar bleibt', async () => {
    const entry = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 1_250,
      date: '2026-09-18',
      note: 'x'.repeat(TEXT_LIMITS.note + 100),
      merchant: 'y'.repeat(TEXT_LIMITS.merchant + 100),
    });
    expect(entry.note).toHaveLength(TEXT_LIMITS.note);
    expect(entry.merchant).toHaveLength(TEXT_LIMITS.merchant);

    const file = await repo.exportAll({ includeReceipts: false });
    expect(exportFileSchema.safeParse(file).success).toBe(true);
  });

  it('kürzt auch beim Ändern', async () => {
    const entry = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 500,
      date: '2026-09-18',
    });
    const updated = await repo.updateEntry(entry.id, { note: 'z'.repeat(TEXT_LIMITS.note + 1) });
    expect(updated.note).toHaveLength(TEXT_LIMITS.note);
  });
});

describe('Bon-Aufteilung und gelernte Zuordnungen', () => {
  it('legt einen aufgeteilten Einkauf als eine Gruppe an', async () => {
    const lebensmittel = await repo.createPot({
      name: 'Lebensmittel',
      kind: 'budget',
      limitCents: 40_000,
      carryOver: false,
    });
    const haushalt = await repo.createPot({
      name: 'Haushalt',
      kind: 'category',
      limitCents: null,
      carryOver: false,
    });

    const gruppe = 'gruppe-1';
    const entries = await repo.createEntries([
      {
        potId: lebensmittel.id,
        kind: 'expense',
        amountCents: 450,
        date: '2026-09-18',
        splitGroupId: gruppe,
      },
      {
        potId: haushalt.id,
        kind: 'expense',
        amountCents: 249,
        date: '2026-09-18',
        splitGroupId: gruppe,
      },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.splitGroupId === gruppe)).toBe(true);

    // Ein Beleg hängt an der ersten Buchung; über die Gruppe ist er für beide
    // auffindbar.
    const receipt = await repo.addReceipt(entries[0]!.id, {
      filename: 'bon.pdf',
      mime: 'application/pdf',
      blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      thumbnail: null,
    });
    expect(receipt.entryId).toBe(entries[0]!.id);

    const snapshot = await repo.loadSnapshot();
    const inGruppe = snapshot.entries.filter((entry) => entry.splitGroupId === gruppe);
    expect(inGruppe).toHaveLength(2);
  });

  it('lässt eine einzelne Buchung ohne Gruppe', async () => {
    const entry = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 100,
      date: '2026-09-18',
    });
    expect(entry.splitGroupId).toBeNull();
  });

  it('merkt sich Zuordnungen und überschreibt statt zu verdoppeln', async () => {
    const erst = await repo.rememberItemRule('vollmilch', 'topf-a');
    const zweit = await repo.rememberItemRule('vollmilch', 'topf-b');

    expect(zweit.id).toBe(erst.id);
    expect(zweit.potId).toBe('topf-b');
    expect(zweit.revision).toBe(2);

    const rules = await repo.listItemRules();
    expect(rules).toHaveLength(1);
  });

  it('vergisst eine Zuordnung als Soft Delete', async () => {
    const rule = await repo.rememberItemRule('spülmittel', 'topf-haushalt');
    await repo.forgetItemRule(rule.id);

    expect(await repo.listItemRules()).toEqual([]);
    // Nicht wirklich weg: Der Datensatz bleibt für den späteren Sync stehen.
    expect(await db.itemRules.get(rule.id)).toMatchObject({ deletedAt: expect.any(String) });
  });

  it('nimmt Zuordnungen in die Sicherung mit', async () => {
    await repo.rememberItemRule('kaffee', 'topf-genuss');
    const file = await repo.exportAll({ includeReceipts: false });

    expect(exportFileSchema.safeParse(file).success).toBe(true);
    expect(file.itemRules.map((rule) => rule.keyword)).toEqual(['kaffee']);

    await repo.wipeAll();
    await repo.setupHousehold({
      name: 'Neu',
      currency: 'EUR',
      locale: 'de-DE',
      periodStartDay: 1,
    });
    await repo.importAll(file, 'replace');
    expect((await repo.listItemRules()).map((rule) => rule.keyword)).toEqual(['kaffee']);
  });

  it('liest eine Sicherung ohne Zuordnungen weiter ein', async () => {
    const file = await repo.exportAll({ includeReceipts: false });
    const { itemRules: _weg, ...alt } = file;
    const parsed = exportFileSchema.safeParse(alt);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.itemRules).toEqual([]);
  });
});

describe('Export und Import', () => {
  it('erzeugt eine Datei, die dem Schema entspricht', async () => {
    const pot = await repo.createPot({
      name: 'Lebensmittel',
      kind: 'budget',
      limitCents: 40_000,
      carryOver: false,
    });
    const entry = await repo.createEntry({
      potId: pot.id,
      kind: 'expense',
      amountCents: 1_250,
      date: '2026-09-18',
    });
    await repo.addReceipt(entry.id, {
      filename: 'zettel.txt',
      mime: 'text/plain',
      blob: new Blob(['beleg'], { type: 'text/plain' }),
      thumbnail: null,
    });

    const file = await repo.exportAll({ includeReceipts: true });
    expect(file.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(() => exportFileSchema.parse(file)).not.toThrow();
    expect(file.receipts).toHaveLength(1);

    const withoutReceipts = await repo.exportAll({ includeReceipts: false });
    expect(withoutReceipts.receipts).toHaveLength(0);
  });

  it('stellt den Stand nach Wipe wieder her (replace)', async () => {
    const pot = await repo.createPot({
      name: 'Lebensmittel',
      kind: 'budget',
      limitCents: 40_000,
      carryOver: false,
    });
    await repo.createEntry({
      potId: pot.id,
      kind: 'expense',
      amountCents: 1_250,
      date: '2026-09-18',
    });
    const file = await repo.exportAll({ includeReceipts: true });

    await repo.wipeAll();
    expect(await repo.getHousehold()).toBeNull();

    // Nach dem Wipe gibt es keinen Nutzer mehr — der Principal bleibt aber
    // gültig, weil er aus der Session kommt, nicht aus der Tabelle.
    const result = await repo.importAll(file, 'replace');
    expect(result.pots).toBe(1);
    expect(result.entries).toBe(1);
    expect((await repo.listPots())[0]?.name).toBe('Lebensmittel');
    expect(await repo.listEntries()).toHaveLength(1);
  });

  it('gewinnt beim Merge mit der höheren revision', async () => {
    const pot = await repo.createPot({
      name: 'Alt',
      kind: 'budget',
      limitCents: 10_000,
      carryOver: false,
    });
    const file = await repo.exportAll({ includeReceipts: false });

    // Lokal weiter geändert -> revision 2, Importdatei hat revision 1.
    await repo.updatePot(pot.id, { name: 'Lokal neuer' });
    const merged = await repo.importAll(file, 'merge');
    expect(merged.skipped).toBeGreaterThan(0);
    expect((await repo.getPot(pot.id))?.name).toBe('Lokal neuer');

    // Umgekehrt: Importdatei ist neuer.
    const newer = {
      ...file,
      pots: file.pots.map((p) => ({ ...p, name: 'Import neuer', revision: 99 })),
    };
    await repo.importAll(newer, 'merge');
    expect((await repo.getPot(pot.id))?.name).toBe('Import neuer');
  });

  it('verweigert dem Leser den Import', async () => {
    const file = await repo.exportAll({ includeReceipts: false });
    principal = { ...principal!, role: 'viewer' };
    await expect(repo.importAll(file, 'replace')).rejects.toThrow(PermissionDeniedError);
  });
});

describe('Outbox (changeLog)', () => {
  it('protokolliert jede Mutation', async () => {
    const before = await repo.pendingChangeCount();
    const pot = await repo.createPot({
      name: 'Sport',
      kind: 'budget',
      limitCents: 5_000,
      carryOver: false,
    });
    await repo.createEntry({
      potId: pot.id,
      kind: 'expense',
      amountCents: 100,
      date: '2026-09-18',
    });
    expect(await repo.pendingChangeCount()).toBe(before + 2);

    const logged = await db.changeLog.toArray();
    expect(logged.some((change) => change.entity === 'pot' && change.op === 'upsert')).toBe(true);
  });

  it('protokolliert Löschungen als delete', async () => {
    const pot = await repo.createPot({
      name: 'Sport',
      kind: 'budget',
      limitCents: 5_000,
      carryOver: false,
    });
    await repo.deletePot(pot.id);
    const logged = await db.changeLog.toArray();
    expect(logged.some((change) => change.entity === 'pot' && change.op === 'delete')).toBe(true);
  });
});

describe('subscribe', () => {
  it('benachrichtigt bei Mutationen und hört nach dem Abmelden auf', async () => {
    let calls = 0;
    const unsubscribe = repo.subscribe(() => {
      calls += 1;
    });
    await repo.createPot({ name: 'Sport', kind: 'budget', limitCents: 5_000, carryOver: false });
    expect(calls).toBe(1);

    unsubscribe();
    await repo.createPot({ name: 'Urlaub', kind: 'budget', limitCents: 5_000, carryOver: false });
    expect(calls).toBe(1);
  });
});

describe('loadSnapshot', () => {
  it('liefert alles außer Beleg-Binärdaten', async () => {
    const pot = await repo.createPot({
      name: 'Lebensmittel',
      kind: 'budget',
      limitCents: 40_000,
      carryOver: false,
    });
    const entry = await repo.createEntry({
      potId: pot.id,
      kind: 'expense',
      amountCents: 1_250,
      date: '2026-09-18',
    });
    await repo.addReceipt(entry.id, {
      filename: 'zettel.txt',
      mime: 'text/plain',
      blob: new Blob(['beleg'], { type: 'text/plain' }),
      thumbnail: null,
    });

    const snapshot = await repo.loadSnapshot();
    expect(snapshot.household).not.toBeNull();
    expect(snapshot.pots).toHaveLength(1);
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.receipts).toHaveLength(1);
    expect('blob' in (snapshot.receipts[0] ?? {})).toBe(false);
  });
});

describe('Rollen-Notausgang', () => {
  it('holt den Gerätenutzer aus einer Sackgasse zurück', async () => {
    const user = await repo.getLocalDeviceUser();
    await repo.setUserRole(user!.id, 'viewer');
    principal = { ...principal!, role: 'viewer' };

    // Sackgasse: als Leser ist weder Rollenwechsel noch Import möglich.
    await expect(repo.setUserRole(user!.id, 'admin')).rejects.toThrow(PermissionDeniedError);

    const restored = await repo.resetLocalDeviceRole();
    expect(restored?.role).toBe('admin');
  });

  it('ändert nichts, wenn der Nutzer schon Admin ist', async () => {
    const before = await repo.getLocalDeviceUser();
    const after = await repo.resetLocalDeviceRole();
    expect(after?.revision).toBe(before?.revision);
  });
});

describe('Snapshot-Cache (Vertrag für useSyncExternalStore)', () => {
  it('ist vor dem ersten Laden null', async () => {
    dbCounter += 1;
    const fresh = createTestDatabase(`cache-${dbCounter}`);
    const freshRepo = new DexieBudgetRepository(fresh, false);
    expect(freshRepo.getCachedSnapshot()).toBeNull();
    await freshRepo.refresh();
    expect(freshRepo.getCachedSnapshot()).not.toBeNull();
    fresh.close();
    await fresh.delete();
  });

  it('gibt zwischen zwei Benachrichtigungen dieselbe Referenz zurück', async () => {
    await repo.refresh();
    const first = repo.getCachedSnapshot();
    expect(repo.getCachedSnapshot()).toBe(first);

    await repo.createPot({ name: 'Sport', kind: 'budget', limitCents: 5_000, carryOver: false });
    // Nach einer Mutation ein neuer Stand — sonst würde die Oberfläche nicht neu rendern.
    expect(repo.getCachedSnapshot()).not.toBe(first);
  });

  it('enthält nach einer Mutation bereits den neuen Stand', async () => {
    await repo.createPot({ name: 'Urlaub', kind: 'budget', limitCents: 10_000, carryOver: false });
    expect(repo.getCachedSnapshot()?.pots.some((pot) => pot.name === 'Urlaub')).toBe(true);
  });
});

describe('Wiederherstellung vor der Einrichtung', () => {
  it('stellt eine Sicherung auf leerer Datenbank ohne Rechte her', async () => {
    const pot = await repo.createPot({
      name: 'Lebensmittel',
      kind: 'budget',
      limitCents: 40_000,
      carryOver: false,
    });
    await repo.createEntry({
      potId: pot.id,
      kind: 'expense',
      amountCents: 1_250,
      date: '2026-09-18',
    });
    const file = await repo.exportAll({ includeReceipts: true });

    await repo.wipeAll();
    // Nach dem Wipe gibt es keinen Nutzer — genau der Fall „neues Gerät".
    principal = null;
    await expect(repo.importAll(file, 'replace')).rejects.toThrow(PermissionDeniedError);

    const result = await repo.restoreFromBackup(file);
    expect(result.entries).toBe(1);
    expect((await repo.getHousehold())?.name).toBe('Testhaushalt');
    expect((await repo.listPots())[0]?.name).toBe('Lebensmittel');
  });

  it('verweigert die Wiederherstellung, wenn schon ein Haushalt existiert', async () => {
    const file = await repo.exportAll({ includeReceipts: false });
    await expect(repo.restoreFromBackup(file)).rejects.toThrow(/schon einen Haushalt/);
  });
});

describe('Standardtopf als Auffangnetz', () => {
  it('bucht eine Ausgabe ohne Topf in den Standardtopf, eine Einnahme nicht', async () => {
    const pot = await repo.createPot({
      name: 'Sonstiges',
      kind: 'category',
      limitCents: null,
      carryOver: false,
    });
    await repo.updateHousehold({ defaultPotId: pot.id });

    const ausgabe = await repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents: 1_000,
      date: '2026-09-18',
    });
    const einnahme = await repo.createEntry({
      potId: null,
      kind: 'income',
      amountCents: 200_000,
      date: '2026-09-18',
    });

    expect(ausgabe.potId).toBe(pot.id);
    // Einnahmen laufen auf den Haushalt — deshalb überspringt das Erfassen bei
    // ihnen auch den Topf-Schritt.
    expect(einnahme.potId).toBeNull();
  });

  it('lässt einen ausdrücklich gewählten Topf unberührt', async () => {
    const standard = await repo.createPot({
      name: 'Sonstiges',
      kind: 'category',
      limitCents: null,
      carryOver: false,
    });
    const sport = await repo.createPot({
      name: 'Sport',
      kind: 'budget',
      limitCents: 5_000,
      carryOver: false,
    });
    await repo.updateHousehold({ defaultPotId: standard.id });

    const entry = await repo.createEntry({
      potId: sport.id,
      kind: 'expense',
      amountCents: 1_000,
      date: '2026-09-18',
    });
    expect(entry.potId).toBe(sport.id);
  });

  it('greift auch bei wiederkehrenden Ausgaben ohne Topf', async () => {
    const pot = await repo.createPot({
      name: 'Sonstiges',
      kind: 'category',
      limitCents: null,
      carryOver: false,
    });
    await repo.updateHousehold({ defaultPotId: pot.id });
    await repo.createRecurringRule({
      potId: null,
      kind: 'expense',
      amountCents: 4_500,
      freq: 'monthly',
      interval: 1,
      dayOfMonth: 1,
      startDate: '2026-09-01',
    });

    const created = await repo.materializeRecurringRules('2026-09-18');
    expect(created).toBeGreaterThan(0);
    const entries = await repo.listEntries();
    expect(entries.every((entry) => entry.potId === pot.id)).toBe(true);
  });

  it('räumt den Standardtopf, wenn der Topf gelöscht oder archiviert wird', async () => {
    const geloescht = await repo.createPot({
      name: 'Weg',
      kind: 'category',
      limitCents: null,
      carryOver: false,
    });
    await repo.updateHousehold({ defaultPotId: geloescht.id });
    await repo.deletePot(geloescht.id);
    expect((await repo.getHousehold())?.defaultPotId).toBeNull();

    const archiviert = await repo.createPot({
      name: 'Ruht',
      kind: 'category',
      limitCents: null,
      carryOver: false,
    });
    await repo.updateHousehold({ defaultPotId: archiviert.id });
    await repo.setPotArchived(archiviert.id, true);
    // Ein Standardtopf, der in keiner Liste mehr steht, wäre ein unsichtbares
    // Ziel für jede Ausgabe ohne Zuordnung.
    expect((await repo.getHousehold())?.defaultPotId).toBeNull();
  });

  it('füllt die Felder auf, die ältere Installationen nicht haben', async () => {
    const stored = await db.households.toArray();
    const raw = { ...stored[0]! } as Record<string, unknown>;
    delete raw.defaultPotId;
    delete raw.askForPot;
    delete raw.tagsEnabled;
    await db.households.put(raw as never);

    const household = await repo.getHousehold();
    // `undefined` wäre unwahr — der Topf würde stumm nicht mehr abgefragt.
    expect(household?.askForPot).toBe(true);
    expect(household?.tagsEnabled).toBe(false);
    expect(household?.defaultPotId).toBeNull();
  });
});

describe('Tags an Buchungen', () => {
  async function bucheMitTags(tags: string[], amountCents = 1_000) {
    return repo.createEntry({
      potId: null,
      kind: 'expense',
      amountCents,
      date: '2026-09-18',
      tags,
    });
  }

  it('räumt die Liste beim Anlegen auf', async () => {
    const entry = await bucheMitTags(['  Urlaub ', 'urlaub', '#auto', '']);
    expect(entry.tags).toEqual(['Urlaub', 'auto']);
  });

  it('filtert unabhängig von der Schreibweise', async () => {
    await bucheMitTags(['Urlaub']);
    await bucheMitTags(['Auto']);

    const gefiltert = await repo.listEntries({ tag: 'urlaub' });
    expect(gefiltert).toHaveLength(1);
    expect(gefiltert[0]?.tags).toEqual(['Urlaub']);
  });

  it('benennt in allen Buchungen um und zählt die geänderten', async () => {
    await bucheMitTags(['Urlaub', 'auto']);
    await bucheMitTags(['urlaub']);
    await bucheMitTags(['bahn']);

    const touched = await repo.renameTag('urlaub', 'Norwegen');
    expect(touched).toBe(2);

    const entries = await repo.listEntries();
    expect(entries.filter((entry) => entry.tags.includes('Norwegen'))).toHaveLength(2);
    expect(entries.some((entry) => entry.tags.some((tag) => /urlaub/i.test(tag)))).toBe(false);
  });

  it('macht aus Quell- und Zieltag an derselben Buchung einen', async () => {
    const entry = await bucheMitTags(['urlaub', 'norwegen']);
    await repo.renameTag('urlaub', 'Norwegen');

    const aktualisiert = await repo.getEntry(entry.id);
    expect(aktualisiert?.tags).toEqual(['Norwegen']);
  });

  it('erhöht die Revision jeder berührten Buchung — sonst fehlt sie beim Sync', async () => {
    const entry = await bucheMitTags(['urlaub']);
    await repo.renameTag('urlaub', 'reise');

    const aktualisiert = await repo.getEntry(entry.id);
    expect(aktualisiert?.revision).toBe(entry.revision + 1);
    const log = await db.changeLog.where('entity').equals('entry').toArray();
    expect(log.filter((row) => row.entityId === entry.id)).toHaveLength(2);
  });

  it('nimmt einen Tag heraus und lässt die Buchung stehen', async () => {
    const entry = await bucheMitTags(['urlaub', 'auto']);
    const touched = await repo.deleteTag('URLAUB');

    expect(touched).toBe(1);
    const aktualisiert = await repo.getEntry(entry.id);
    expect(aktualisiert?.tags).toEqual(['auto']);
    expect(aktualisiert?.amountCents).toBe(1_000);
  });

  it('tut beim Umbenennen auf denselben Namen nichts', async () => {
    await bucheMitTags(['Urlaub']);
    expect(await repo.renameTag('urlaub', 'URLAUB')).toBe(0);
  });

  it('lehnt einen leeren neuen Namen ab', async () => {
    await bucheMitTags(['urlaub']);
    await expect(repo.renameTag('urlaub', '  #  ')).rejects.toThrow(/leer/);
  });

  it('verlangt das Recht auf fremde Buchungen', async () => {
    await bucheMitTags(['urlaub']);
    principal = { ...principal!, role: 'member' };
    await expect(repo.renameTag('urlaub', 'reise')).rejects.toThrow(PermissionDeniedError);
    await expect(repo.deleteTag('urlaub')).rejects.toThrow(PermissionDeniedError);
  });
});
