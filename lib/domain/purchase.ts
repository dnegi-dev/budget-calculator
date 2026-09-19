/**
 * Was aus den Posten eines Einkaufs an Buchungen werden soll.
 *
 * Der Bon-Import machte bisher aus 18 Artikelzeilen je Topf **eine** Buchung
 * und warf die Zeilen weg. Wer danach merkte, dass die Zahnpasta im falschen
 * Topf steckt, konnte nur den ganzen Betrag umbuchen. Jetzt bleiben die Posten
 * liegen, und ein Posten, der den Topf wechselt, rechnet die Buchungen neu.
 *
 * **Diese Datei rechnet nur, sie schreibt nicht.** Sie bekommt den Einkauf,
 * seine Posten und die Buchungen, die es dazu schon gibt, und liefert einen
 * Plan: was anzulegen, was zu ändern, was zu entfernen ist. Das Repository
 * führt ihn in einer Transaktion aus. Der Grund ist derselbe wie bei
 * `materializeRecurringRules`: Eine Rechnung, die sich still verrechnen kann,
 * gehört dorthin, wo ein Test sie ohne Datenbank prüfen kann.
 *
 * Gruppiert wird über `groupItemsByPot` aus `receipt-parse.ts` — dieselbe
 * Funktion, die schon die Vorschau im Import benutzt. Eine zweite Gruppierung
 * wäre eine zweite Wahrheit, und sie würden auseinanderlaufen.
 */

import { newId } from './ids';
import { groupItemsByPot } from './receipt-parse';
import { TEXT_LIMITS } from './schemas';
import { dedupeTags } from './tags';
import type { Entry, EntryKind, NewEntryInput, Purchase, PurchaseItem } from './types';

/** Eine bestehende Buchung, wie der Plan sie verändern will. */
export interface EntryUpdate {
  id: string;
  potId: string | null;
  kind: EntryKind;
  amountCents: number;
  note: string | null;
  tags: string[];
  splitGroupId: string | null;
}

export interface EntryPlan {
  create: NewEntryInput[];
  update: EntryUpdate[];
  /** IDs der Buchungen, die kein Posten mehr trägt. */
  remove: string[];
  /**
   * Die Buchung, an der der Beleg danach hängen soll.
   *
   * **Die Stelle, an der es sonst schiefgeht.** Der Beleg hängt an einer
   * einzelnen Buchung (`Receipt.entryId`), und `deleteEntry` löscht die
   * Belege seiner Buchung mit. Wandert der letzte Posten aus genau dieser
   * Buchung heraus, wäre der Bon weg — die Datei, die belegt, dass der
   * Einkauf so stattgefunden hat. Deshalb nennt der Plan den neuen Anker
   * ausdrücklich, und das Repository hängt den Beleg um, **bevor** es löscht.
   *
   * `null` heißt: Es bleibt keine Buchung übrig, an der er hängen könnte.
   */
  receiptAnchorId: string | null;
}

export interface PlanOptions {
  tagsEnabled: boolean;
  /** Tags des ganzen Einkaufs; jede Buchung bekommt sie zusätzlich zu denen ihrer Posten. */
  purchaseTags?: readonly string[];
  /**
   * Die Klammer um die Buchungen dieses Einkaufs. `null` überlässt die
   * Entscheidung dem Plan: mehr als eine Buchung braucht eine Kennung, eine
   * einzelne nicht.
   */
  splitGroupId?: string | null;
}

/**
 * Rechnet die Buchungen eines Einkaufs aus seinen Posten.
 *
 * Zuordnung über den Topf: Eine bestehende Buchung mit demselben Topf wird
 * weiterbenutzt, statt gelöscht und neu angelegt zu werden. Das ist kein
 * Geschmack — eine neue Buchung hätte eine neue ID, und alles, was daran
 * hängt (der Beleg, eine spätere Notiz, die `revision` für den Sync), wäre
 * weg.
 */
export function planPurchaseEntries(
  purchase: Purchase,
  items: readonly PurchaseItem[],
  existing: readonly Entry[],
  options: PlanOptions,
): EntryPlan {
  const sortiert = [...items].sort((a, b) => a.sortIndex - b.sortIndex);
  const groups = groupItemsByPot(
    sortiert.map((item) => ({
      label: item.label,
      amountCents: item.amountCents,
      quantity: item.quantity,
    })),
    sortiert.map((item) => item.potId),
  );

  /**
   * Eine Kennung nur, wenn es etwas zu klammern gibt. Fällt ein Einkauf auf
   * eine einzige Buchung zusammen, verschwindet sie wieder — sonst zeigte
   * `EntryList` weiter „Teil eines Einkaufs" für eine Buchung, die allein
   * dasteht.
   *
   * Eine vorhandene Klammer wird weiterbenutzt: Eine neue würde die
   * bestehenden Buchungen aus der Gruppe reißen, an der `EntryList` den Bon
   * für alle anzeigt. Erst wenn es gar keine gibt, entsteht eine — hier und
   * nicht beim Aufrufer, sonst stünde die Regel „mehr als eine Buchung
   * braucht eine Klammer" an zwei Stellen.
   */
  const splitGroupId =
    groups.length > 1 ? (options.splitGroupId ?? bestehendeGruppe(existing) ?? newId()) : null;

  const offen = new Map<string | null, Entry[]>();
  for (const entry of existing) {
    const liste = offen.get(entry.potId);
    if (liste) liste.push(entry);
    else offen.set(entry.potId, [entry]);
  }

  const create: NewEntryInput[] = [];
  const update: EntryUpdate[] = [];
  const behalten = new Set<string>();

  for (const group of groups) {
    const tags = options.tagsEnabled
      ? dedupeTags([
          ...(options.purchaseTags ?? []),
          ...group.indices.flatMap((index) => sortiert[index]?.tags ?? []),
        ])
      : [];
    const note = group.labels.join(', ').slice(0, TEXT_LIMITS.note);

    const passend = offen.get(group.potId)?.shift() ?? null;
    if (passend) {
      behalten.add(passend.id);
      update.push({
        id: passend.id,
        potId: group.potId,
        kind: group.kind,
        amountCents: group.amountCents,
        note,
        tags,
        splitGroupId,
      });
    } else {
      create.push({
        potId: group.potId,
        kind: group.kind,
        amountCents: group.amountCents,
        date: purchase.date,
        merchant: purchase.merchant,
        note,
        tags,
        splitGroupId,
        purchaseId: purchase.id,
      });
    }
  }

  const remove = existing.filter((entry) => !behalten.has(entry.id)).map((entry) => entry.id);

  return { create, update, remove, receiptAnchorId: ankerFuer(existing, behalten) };
}

/**
 * Wer den Beleg künftig trägt.
 *
 * Erste Wahl ist eine Buchung, die bleibt — dann muss nichts umgehängt
 * werden. Bleibt keine, gibt der Plan `null` zurück; das Repository hängt den
 * Beleg dann an die erste **neu angelegte** Buchung, die es ja erst nach dem
 * Schreiben kennt.
 */
function ankerFuer(existing: readonly Entry[], behalten: ReadonlySet<string>): string | null {
  const bleibt = existing.find((entry) => behalten.has(entry.id));
  return bleibt?.id ?? null;
}

/** Die Klammer, die die bestehenden Buchungen schon tragen. */
function bestehendeGruppe(existing: readonly Entry[]): string | null {
  return existing.find((entry) => entry.splitGroupId !== null)?.splitGroupId ?? null;
}
