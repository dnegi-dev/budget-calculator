import { describe, expect, it } from 'vitest';
import {
  fabLabel,
  fabVisibleOnPath,
  resolveFabAction,
  resolveGoalFabAction,
  scopeForPath,
} from './fab';
import type { Household, Pot } from './types';

/** Nur die zwei Felder, die `resolveFabAction` liest. */
function haushalt(patch: Partial<Pick<Household, 'fabDefault' | 'fabScopes'>> = {}) {
  return { fabDefault: 'expense' as const, fabScopes: {}, ...patch };
}

describe('scopeForPath', () => {
  it('trennt die Unterseiten von ihren Elternseiten', () => {
    expect(scopeForPath('/')).toBe('pots');
    expect(scopeForPath('/buchungen')).toBe('entries');
    expect(scopeForPath('/buchungen/wiederkehrend')).toBe('recurring');
    expect(scopeForPath('/toepfe')).toBe('pots');
    expect(scopeForPath('/toepfe/detail')).toBe('potDetail');
    expect(scopeForPath('/auswertung')).toBe('analysis');
  });

  /**
   * `trailingSlash: true` ist im Export gesetzt, der Pfad kommt also als
   * `/buchungen/`. `startsWith` trifft das noch; `'/' === pfad` für die
   * Startseite aber nicht mehr, sobald man den Schrägstrich abschneidet —
   * deshalb prüft der Test beide Enden.
   */
  it('kommt mit dem nachgestellten Schrägstrich zurecht', () => {
    expect(scopeForPath('/buchungen/')).toBe('entries');
    expect(scopeForPath('/buchungen/wiederkehrend/')).toBe('recurring');
    expect(scopeForPath('/toepfe/detail/')).toBe('potDetail');
    expect(scopeForPath('/')).toBe('pots');
  });

  it('gibt für Unbekanntes null zurück', () => {
    expect(scopeForPath('/impressum')).toBeNull();
    expect(scopeForPath('/gibtsnicht')).toBeNull();
  });
});

describe('fabVisibleOnPath', () => {
  it('versteckt den Knopf in den Einstellungen und auf den Rechtsseiten', () => {
    expect(fabVisibleOnPath('/einstellungen')).toBe(false);
    expect(fabVisibleOnPath('/einstellungen/darstellung/')).toBe(false);
    expect(fabVisibleOnPath('/impressum/')).toBe(false);
    expect(fabVisibleOnPath('/datenschutz')).toBe(false);
  });

  it('zeigt ihn überall sonst', () => {
    expect(fabVisibleOnPath('/')).toBe(true);
    expect(fabVisibleOnPath('/buchungen/')).toBe(true);
    expect(fabVisibleOnPath('/toepfe/detail/')).toBe(true);
  });
});

describe('resolveFabAction', () => {
  it('nimmt die allgemeine Einstellung, wenn der Bereich nichts sagt', () => {
    expect(resolveFabAction(haushalt({ fabDefault: 'income' }), 'home')).toBe('income');
    expect(resolveFabAction(haushalt({ fabDefault: 'ask' }), null)).toBe('ask');
  });

  it('lässt den Bereich gewinnen', () => {
    const h = haushalt({ fabDefault: 'expense', fabScopes: { entries: 'income' } });
    expect(resolveFabAction(h, 'entries')).toBe('income');
    // Und wirklich nur dort.
    expect(resolveFabAction(h, 'home')).toBe('expense');
  });

  /**
   * Der Grund, warum ein fehlender Schlüssel „wie überall" heißt und nicht
   * ein eigener Wert `'inherit'`: Wer das Allgemeine ändert, soll das in
   * jedem Bereich sehen, für den er nichts eingestellt hat.
   */
  it('folgt dem Allgemeinen, wenn es sich ändert', () => {
    const scopes = { entries: 'income' as const };
    expect(resolveFabAction(haushalt({ fabDefault: 'ask', fabScopes: scopes }), 'home')).toBe(
      'ask',
    );
  });

  it('fällt ohne Haushalt und ohne Werte auf die Ausgabe zurück', () => {
    expect(resolveFabAction(null, 'home')).toBe('expense');
    // Ein bestehender Haushalt, dessen Felder noch fehlen: Dexie liefert
    // `undefined`, und `withHouseholdDefaults` greift erst beim Lesen.
    const alt = { fabDefault: undefined, fabScopes: undefined } as unknown as Pick<
      Household,
      'fabDefault' | 'fabScopes'
    >;
    expect(resolveFabAction(alt, 'entries')).toBe('expense');
  });
});

describe('resolveGoalFabAction', () => {
  function topf(goalPhase: Pot['goalPhase']): Pick<Pot, 'kind' | 'goalPhase'> {
    return { kind: 'goal', goalPhase };
  }

  it('legt in der Einzahlphase auf Ausgabe, in der Auszahlphase auf Einnahme fest', () => {
    expect(resolveGoalFabAction('expense', topf('saving'))).toBe('expense');
    expect(resolveGoalFabAction('income', topf('saving'))).toBe('expense');
    expect(resolveGoalFabAction('expense', topf('spending'))).toBe('income');
    expect(resolveGoalFabAction('income', topf('spending'))).toBe('income');
  });

  it('lässt „ask" unangetastet', () => {
    expect(resolveGoalFabAction('ask', topf('spending'))).toBe('ask');
  });

  it('lässt Nicht-Sparziel-Töpfe und „kein Topf" unverändert', () => {
    expect(resolveGoalFabAction('income', { kind: 'budget', goalPhase: null })).toBe('income');
    expect(resolveGoalFabAction('expense', null)).toBe('expense');
  });
});

describe('fabLabel', () => {
  it('benennt, was ein Tippen tut', () => {
    expect(fabLabel('expense')).toBe('Ausgabe erfassen');
    expect(fabLabel('income')).toBe('Einnahme erfassen');
    expect(fabLabel('ask')).toBe('Buchung erfassen');
  });
});
