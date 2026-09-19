import { describe, expect, it } from 'vitest';
import { planPurchaseEntries } from './purchase';
import type { Entry, Purchase, PurchaseItem } from './types';

const HOUSEHOLD = 'h1';
const meta = {
  householdId: HOUSEHOLD,
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
  revision: 1,
  deletedAt: null,
};

const einkauf: Purchase = {
  ...meta,
  id: 'k1',
  merchant: 'Supermarkt',
  date: '2026-09-19',
  totalCents: 1_000,
  quality: 'exakt',
  tags: [],
};

let postenZaehler = 0;
function posten(overrides: Partial<PurchaseItem> = {}): PurchaseItem {
  postenZaehler += 1;
  return {
    ...meta,
    id: `i${postenZaehler}`,
    purchaseId: 'k1',
    label: `Posten ${postenZaehler}`,
    amountCents: 100,
    quantity: null,
    potId: null,
    tags: [],
    sortIndex: postenZaehler,
    ...overrides,
  };
}

let buchungsZaehler = 0;
function buchung(overrides: Partial<Entry> = {}): Entry {
  buchungsZaehler += 1;
  return {
    ...meta,
    id: `e${buchungsZaehler}`,
    potId: null,
    kind: 'expense',
    amountCents: 100,
    date: '2026-09-19',
    note: null,
    merchant: 'Supermarkt',
    address: null,
    recurringRuleId: null,
    splitGroupId: null,
    purchaseId: 'k1',
    tags: [],
    createdBy: 'u1',
    ...overrides,
  };
}

const ohneTags = { tagsEnabled: false };

describe('planPurchaseEntries', () => {
  it('legt je Topf eine Buchung an, wenn es noch keine gibt', () => {
    const plan = planPurchaseEntries(
      einkauf,
      [
        posten({ potId: 'p1', amountCents: 250 }),
        posten({ potId: 'p2', amountCents: 400 }),
        posten({ potId: 'p1', amountCents: 350 }),
      ],
      [],
      ohneTags,
    );

    expect(plan.create).toHaveLength(2);
    expect(plan.create[0]).toMatchObject({ potId: 'p1', amountCents: 600, kind: 'expense' });
    expect(plan.create[1]).toMatchObject({ potId: 'p2', amountCents: 400 });
    // Mehr als eine Buchung braucht eine Klammer.
    expect(plan.create[0]?.splitGroupId).not.toBeNull();
    expect(plan.create[0]?.splitGroupId).toBe(plan.create[1]?.splitGroupId);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('behält eine bestehende Buchung, statt sie neu anzulegen', () => {
    const vorhanden = buchung({ id: 'e1', potId: 'p1', amountCents: 600, splitGroupId: 'g1' });
    const plan = planPurchaseEntries(
      einkauf,
      [posten({ potId: 'p1', amountCents: 250 }), posten({ potId: 'p1', amountCents: 500 })],
      [vorhanden],
      ohneTags,
    );

    // Dieselbe ID, neuer Betrag: Eine neue Buchung hätte den Beleg und die
    // `revision` verloren.
    expect(plan.create).toEqual([]);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0]).toMatchObject({ id: 'e1', amountCents: 750 });
    expect(plan.remove).toEqual([]);
  });

  it('lässt einen Posten den Topf wechseln: der Betrag wandert mit', () => {
    const a = buchung({ id: 'e1', potId: 'p1', amountCents: 750, splitGroupId: 'g1' });
    const b = buchung({ id: 'e2', potId: 'p2', amountCents: 250, splitGroupId: 'g1' });

    // Der 500er wandert von p1 nach p2.
    const plan = planPurchaseEntries(
      einkauf,
      [
        posten({ potId: 'p1', amountCents: 250 }),
        posten({ potId: 'p2', amountCents: 500 }),
        posten({ potId: 'p2', amountCents: 250 }),
      ],
      [a, b],
      ohneTags,
    );

    expect(plan.update).toEqual([
      expect.objectContaining({ id: 'e1', potId: 'p1', amountCents: 250 }),
      expect.objectContaining({ id: 'e2', potId: 'p2', amountCents: 750 }),
    ]);
    expect(plan.remove).toEqual([]);
  });

  /**
   * Der Fall, der den Beleg kostet, wenn man ihn übersieht: Der letzte
   * Posten eines Topfes wandert weg, die Buchung fällt weg — und an genau
   * dieser Buchung hing der Bon.
   */
  it('nennt einen neuen Anker, wenn die Buchung des Belegs wegfällt', () => {
    const traegtBeleg = buchung({ id: 'e1', potId: 'p1', amountCents: 250, splitGroupId: 'g1' });
    const andere = buchung({ id: 'e2', potId: 'p2', amountCents: 750, splitGroupId: 'g1' });

    const plan = planPurchaseEntries(
      einkauf,
      [posten({ potId: 'p2', amountCents: 250 }), posten({ potId: 'p2', amountCents: 750 })],
      [traegtBeleg, andere],
      ohneTags,
    );

    expect(plan.remove).toEqual(['e1']);
    // Nicht die gelöschte: `e2` bleibt und trägt den Beleg weiter.
    expect(plan.receiptAnchorId).toBe('e2');
    expect(plan.receiptAnchorId).not.toBe('e1');
  });

  it('löst die Klammer auf, wenn nur noch eine Buchung übrig ist', () => {
    const a = buchung({ id: 'e1', potId: 'p1', amountCents: 250, splitGroupId: 'g1' });
    const b = buchung({ id: 'e2', potId: 'p2', amountCents: 750, splitGroupId: 'g1' });

    const plan = planPurchaseEntries(
      einkauf,
      [posten({ potId: 'p1', amountCents: 250 }), posten({ potId: 'p1', amountCents: 750 })],
      [a, b],
      ohneTags,
    );

    expect(plan.update).toEqual([
      expect.objectContaining({ id: 'e1', amountCents: 1_000, splitGroupId: null }),
    ]);
    expect(plan.remove).toEqual(['e2']);
    expect(plan.receiptAnchorId).toBe('e1');
  });

  it('behält die bestehende Klammer, statt eine neue zu erfinden', () => {
    const a = buchung({ id: 'e1', potId: 'p1', amountCents: 250, splitGroupId: 'g1' });
    const b = buchung({ id: 'e2', potId: 'p2', amountCents: 750, splitGroupId: 'g1' });

    const plan = planPurchaseEntries(
      einkauf,
      [posten({ potId: 'p1', amountCents: 250 }), posten({ potId: 'p2', amountCents: 750 })],
      [a, b],
      ohneTags,
    );

    expect(plan.update.map((u) => u.splitGroupId)).toEqual(['g1', 'g1']);
  });

  /**
   * Pfand und Pfandrückgabe im selben Topf heben sich auf. Eine Buchung über
   * 0,00 € wäre Rauschen — `groupItemsByPot` lässt sie weg, und der Plan
   * räumt die bestehende dann ab.
   */
  it('entfernt eine Buchung, deren Posten sich zu null summieren', () => {
    const a = buchung({ id: 'e1', potId: 'p1', amountCents: 25 });
    const plan = planPurchaseEntries(
      einkauf,
      [posten({ potId: 'p1', amountCents: 25 }), posten({ potId: 'p1', amountCents: -25 })],
      [a],
      ohneTags,
    );

    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual(['e1']);
    expect(plan.receiptAnchorId).toBeNull();
  });

  it('dreht die Art, wenn ein Topf unterm Strich Geld zurückbringt', () => {
    const plan = planPurchaseEntries(
      einkauf,
      [posten({ potId: 'p1', amountCents: 100 }), posten({ potId: 'p1', amountCents: -250 })],
      [],
      ohneTags,
    );

    // Beträge bleiben positiv, das Vorzeichen steckt in `kind`.
    expect(plan.create[0]).toMatchObject({ kind: 'income', amountCents: 150 });
  });

  it('sammelt die Tags der Posten an ihrer Buchung, samt denen des Einkaufs', () => {
    const plan = planPurchaseEntries(
      einkauf,
      [
        posten({ potId: 'p1', amountCents: 100, tags: ['Grillen'] }),
        posten({ potId: 'p1', amountCents: 100, tags: ['grillen', 'Kohle'] }),
        posten({ potId: 'p2', amountCents: 100, tags: ['Büro'] }),
      ],
      [],
      { tagsEnabled: true, purchaseTags: ['Wocheneinkauf'] },
    );

    // „Grillen" und „grillen" sind derselbe Tag — `dedupeTags` entscheidet das.
    expect(plan.create[0]?.tags).toEqual(['Wocheneinkauf', 'Grillen', 'Kohle']);
    expect(plan.create[1]?.tags).toEqual(['Wocheneinkauf', 'Büro']);
  });

  it('lässt Tags weg, solange sie ausgeschaltet sind', () => {
    const plan = planPurchaseEntries(einkauf, [posten({ potId: 'p1', tags: ['Grillen'] })], [], {
      tagsEnabled: false,
      purchaseTags: ['Wocheneinkauf'],
    });

    expect(plan.create[0]?.tags).toEqual([]);
  });

  it('nimmt die Bezeichnungen als Notiz und folgt der Reihenfolge des Bons', () => {
    const plan = planPurchaseEntries(
      einkauf,
      [
        posten({ potId: 'p1', label: 'Milch', sortIndex: 2 }),
        posten({ potId: 'p1', label: 'Brot', sortIndex: 1 }),
      ],
      [],
      ohneTags,
    );

    expect(plan.create[0]?.note).toBe('Brot, Milch');
  });

  it('kommt mit einem Einkauf ohne verwertbare Posten zurecht', () => {
    const plan = planPurchaseEntries(einkauf, [], [], ohneTags);
    expect(plan).toEqual({ create: [], update: [], remove: [], receiptAnchorId: null });
  });
});
