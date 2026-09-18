import { describe, expect, it } from 'vitest';
import { clampBackupText, describeImportError } from './backup';
import { exportFileSchema, TEXT_LIMITS } from './schemas';

function minimalBackup() {
  return {
    schemaVersion: 1,
    exportedAt: '2026-09-18T10:00:00.000Z',
    app: 'haushaltsplanung',
    household: {
      id: 'h1',
      name: 'Zuhause',
      currency: 'EUR',
      locale: 'de-DE',
      periodStartDay: 1,
      onboardingCompletedAt: '2026-09-01T10:00:00.000Z',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      revision: 1,
    },
    users: [] as unknown[],
    pots: [] as unknown[],
    entries: [] as unknown[],
    recurringRules: [] as unknown[],
    receipts: [] as unknown[],
  };
}

function entry(note: string | null, merchant: string | null = null) {
  return {
    id: 'e1',
    householdId: 'h1',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    revision: 1,
    deletedAt: null,
    potId: null,
    kind: 'expense',
    amountCents: 1250,
    date: '2026-09-02',
    note,
    merchant,
    recurringRuleId: null,
    createdBy: 'u1',
  };
}

describe('clampBackupText', () => {
  it('lässt eine unauffällige Sicherung unangetastet', () => {
    const backup = minimalBackup();
    backup.entries = [entry('Milch', 'Supermarkt')];
    expect(clampBackupText(backup)).toBe(0);
    expect((backup.entries[0] as { note: string }).note).toBe('Milch');
  });

  it('kürzt eine zu lange Notiz und zählt sie', () => {
    const backup = minimalBackup();
    const lang = 'x'.repeat(TEXT_LIMITS.note + 42);
    backup.entries = [entry(lang)];
    expect(clampBackupText(backup)).toBe(1);
    expect((backup.entries[0] as { note: string }).note).toHaveLength(TEXT_LIMITS.note);
  });

  it('macht die Datei damit einlesbar — das war der Fehler', () => {
    const backup = minimalBackup();
    backup.entries = [entry('y'.repeat(TEXT_LIMITS.note + 1))];
    expect(exportFileSchema.safeParse(backup).success).toBe(false);
    clampBackupText(backup);
    expect(exportFileSchema.safeParse(backup).success).toBe(true);
  });

  it('zählt jedes Feld einzeln', () => {
    const backup = minimalBackup();
    backup.entries = [
      entry('a'.repeat(TEXT_LIMITS.note + 1), 'b'.repeat(TEXT_LIMITS.merchant + 1)),
    ];
    backup.recurringRules = [{ note: 'c'.repeat(TEXT_LIMITS.note + 1) }];
    backup.pots = [{ name: 'd'.repeat(TEXT_LIMITS.potName + 1) }];
    backup.household.name = 'e'.repeat(TEXT_LIMITS.householdName + 1);
    expect(clampBackupText(backup)).toBe(5);
  });

  it('lässt null, Zahlen und fremde Felder in Ruhe', () => {
    const backup = minimalBackup();
    backup.entries = [entry(null), { note: 42 }, 'kein Objekt'];
    expect(clampBackupText(backup)).toBe(0);
  });

  it('erträgt Müll, ohne zu werfen', () => {
    expect(clampBackupText(null)).toBe(0);
    expect(clampBackupText('nein')).toBe(0);
    expect(clampBackupText({ entries: 'keine Liste' })).toBe(0);
  });
});

describe('describeImportError', () => {
  it('nennt Pfad und Grund und zählt den Rest', () => {
    const backup = minimalBackup();
    backup.entries = [entry('ok'), entry('ok'), entry('ok'), entry('ok')];
    backup.entries = backup.entries.map((item) => ({
      ...(item as Record<string, unknown>),
      amountCents: -1,
    }));
    const parsed = exportFileSchema.safeParse(backup);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const text = describeImportError(parsed.error);
    expect(text).toContain('entries.0.amountCents');
    expect(text).toContain('weitere Abweichung');
    expect(text.split('\n')).toHaveLength(5);
  });
});
