import { describe, expect, it } from 'vitest';
import {
  entryKindActionLabel,
  entryKindLabel,
  kindForGoalPhase,
  potActionLabel,
  potTargetSentence,
} from './entry-kinds';
import type { Pot } from './types';

function topf(kind: Pot['kind']): Pick<Pot, 'kind'> {
  return { kind };
}

describe('entryKindLabel', () => {
  it('übersetzt auf einem Sparziel-Topf', () => {
    expect(entryKindLabel('expense', topf('goal'))).toBe('Einzahlen');
    expect(entryKindLabel('income', topf('goal'))).toBe('Ausgeben');
  });

  it('bleibt bei jeder anderen Topf-Art und ohne Topf unverändert', () => {
    expect(entryKindLabel('expense', topf('budget'))).toBe('Ausgabe');
    expect(entryKindLabel('income', topf('envelope'))).toBe('Einnahme');
    expect(entryKindLabel('expense', topf('category'))).toBe('Ausgabe');
    expect(entryKindLabel('expense', null)).toBe('Ausgabe');
    expect(entryKindLabel('income', null)).toBe('Einnahme');
  });
});

describe('entryKindActionLabel', () => {
  it('übersetzt als Handlung', () => {
    expect(entryKindActionLabel('expense', topf('goal'))).toBe('Einzahlen erfassen');
    expect(entryKindActionLabel('income', topf('goal'))).toBe('Ausgeben erfassen');
  });

  it('bleibt sonst bei der gewohnten Handlung', () => {
    expect(entryKindActionLabel('expense', topf('budget'))).toBe('Ausgabe erfassen');
    expect(entryKindActionLabel('income', null)).toBe('Einnahme erfassen');
  });
});

describe('kindForGoalPhase', () => {
  it('leitet die vorbelegte Buchungsart aus der Phase ab', () => {
    expect(kindForGoalPhase('saving')).toBe('expense');
    expect(kindForGoalPhase('spending')).toBe('income');
  });
});

describe('Beschriftungen mit Topfnamen', () => {
  const budget = { kind: 'budget' as const, name: 'Lebensmittel' };
  const ziel = { kind: 'goal' as const, name: 'Urlaub' };

  it('nennt den Knopf je nach Topf-Art', () => {
    expect(potActionLabel(budget, 'expense')).toBe('Auf „Lebensmittel“ buchen');
    expect(potActionLabel(ziel, 'expense')).toBe('In „Urlaub“ einzahlen');
    expect(potActionLabel(ziel, 'income')).toBe('Von „Urlaub“ ausgeben');
  });

  it('nennt das Ziel im Erfassen-Sheet', () => {
    expect(potTargetSentence(budget, 'income')).toBe('Wird auf „Lebensmittel“ gebucht.');
    expect(potTargetSentence(ziel, 'expense')).toBe('Wird auf „Urlaub“ eingezahlt.');
    expect(potTargetSentence(ziel, 'income')).toBe('Wird von „Urlaub“ ausgegeben.');
  });
});
