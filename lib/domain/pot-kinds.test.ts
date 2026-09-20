import { describe, expect, it } from 'vitest';
import {
  applyPotKindPreset,
  describePotConfig,
  goalPhaseOf,
  hasGoal,
  hasLimit,
  isGoalDue,
  matchesPreset,
  POT_KINDS,
  POT_KIND_PRESETS,
} from './pot-kinds';

const base = {
  limitCents: null as number | null,
  carryOver: false,
  goalCents: null as number | null,
  targetDate: null as string | null,
};

describe('POT_KINDS', () => {
  it('kennt vier Arten, jede mit einem Preset', () => {
    expect(POT_KINDS).toEqual(['budget', 'envelope', 'category', 'goal']);
    for (const kind of POT_KINDS) {
      expect(POT_KIND_PRESETS[kind].kind).toBe(kind);
    }
  });

  it('verlangt bei „goal" weder Limit noch Übertrag, aber ein Sparziel', () => {
    const preset = POT_KIND_PRESETS.goal;
    expect(preset.requiresLimit).toBe(false);
    expect(preset.carryOver).toBe(false);
    expect(preset.requiresGoal).toBe(true);
  });
});

describe('applyPotKindPreset', () => {
  it('verwirft das Limit bei „goal", wie bei „category"', () => {
    expect(applyPotKindPreset('goal', 50_000).limitCents).toBeNull();
  });
});

describe('hasGoal', () => {
  it('unterscheidet gesetzten von leerem Zielbetrag', () => {
    expect(hasGoal({ goalCents: 100_000 })).toBe(true);
    expect(hasGoal({ goalCents: null })).toBe(false);
  });
});

describe('matchesPreset', () => {
  it('erkennt einen unveränderten Sparziel-Topf', () => {
    expect(matchesPreset({ ...base, kind: 'goal', goalCents: 100_000 })).toBe(true);
  });

  it('markiert einen Sparziel-Topf ohne Betrag als abweichend', () => {
    expect(matchesPreset({ ...base, kind: 'goal', goalCents: null })).toBe(false);
  });
});

describe('isGoalDue', () => {
  it('ist erst nach der Frist fällig, nicht am Tag selbst', () => {
    const pot = { kind: 'goal' as const, targetDate: '2026-06-15' };
    expect(isGoalDue(pot, '2026-06-14')).toBe(false);
    expect(isGoalDue(pot, '2026-06-15')).toBe(false);
    expect(isGoalDue(pot, '2026-06-16')).toBe(true);
  });

  it('ist bei anderen Arten und ohne Frist nie fällig', () => {
    expect(isGoalDue({ kind: 'budget', targetDate: '2020-01-01' }, '2026-01-01')).toBe(false);
    expect(isGoalDue({ kind: 'goal', targetDate: null }, '2026-01-01')).toBe(false);
  });
});

describe('goalPhaseOf', () => {
  it('ist null bei jeder anderen Art und ohne Topf', () => {
    expect(goalPhaseOf({ kind: 'budget', goalPhase: 'spending' })).toBeNull();
    expect(goalPhaseOf(null)).toBeNull();
  });

  it('reicht eine gesetzte Phase durch', () => {
    expect(goalPhaseOf({ kind: 'goal', goalPhase: 'spending' })).toBe('spending');
    expect(goalPhaseOf({ kind: 'goal', goalPhase: 'saving' })).toBe('saving');
  });

  it('fällt bei Töpfen aus der Zeit vor diesem Feld auf „saving" zurück', () => {
    const alt = { kind: 'goal', goalPhase: undefined } as unknown as {
      kind: 'goal';
      goalPhase: null;
    };
    expect(goalPhaseOf(alt)).toBe('saving');
    expect(goalPhaseOf({ kind: 'goal', goalPhase: null })).toBe('saving');
  });
});

describe('describePotConfig', () => {
  const money = (cents: number) => `${(cents / 100).toFixed(2)} €`;
  const day = (date: string) => date;

  it('beschreibt ein Sparziel mit Betrag und Frist', () => {
    expect(describePotConfig({ ...base, kind: 'goal', goalCents: 120_000 }, money, undefined)).toBe(
      'Ziel: 1200.00 €',
    );
    expect(
      describePotConfig(
        { ...base, kind: 'goal', goalCents: 120_000, targetDate: '2026-06-15' },
        money,
        day,
      ),
    ).toBe('Ziel: 1200.00 € bis 2026-06-15');
  });

  it('bleibt für die übrigen Arten unverändert', () => {
    expect(hasLimit({ limitCents: 5_000 })).toBe(true);
    expect(describePotConfig({ ...base, kind: 'category' }, money)).toBe('Ohne Limit');
    expect(
      describePotConfig({ ...base, kind: 'envelope', limitCents: 5_000, carryOver: true }, money),
    ).toBe('50.00 € pro Periode, mit Übertrag');
  });
});
