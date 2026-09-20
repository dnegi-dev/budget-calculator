/**
 * Auswertungslogik: Was ist in einem Topf verbraucht, was ist noch übrig?
 *
 * Reine Funktionen — kein React, kein Storage. Diese Datei ist der Kern, der
 * falsch sein kann, ohne dass es auffällt. Deshalb liegt sie getrennt und ist
 * vollständig mit Tests abgedeckt (`ledger.test.ts`).
 */

import { periodForDate, periodFromKey, periodDistance, shiftPeriodKey } from './period';
import { hasLimit } from './pot-kinds';
import type { Entry, IsoDateTime, Pot } from './types';

/**
 * Obergrenze für die Übertragsberechnung. Ein Envelope-Topf, der vor zehn
 * Jahren angelegt wurde, soll nicht 120 Perioden rückwärts summieren müssen.
 */
const MAX_CARRY_PERIODS = 120;

export interface PotPeriodState {
  potId: string;
  periodKey: string;
  /** Ausgaben in dieser Periode. */
  spentCents: number;
  /** Einnahmen, die auf diesen Topf gebucht wurden (Erstattungen, Zuweisungen). */
  refundCents: number;
  /** Tatsächlicher Verbrauch: Ausgaben minus Erstattungen. */
  netCents: number;
  limitCents: number | null;
  /** Übertrag aus früheren Perioden. Nur bei `carryOver` von null verschieden. */
  carriedInCents: number;
  /** Verfügbar = Limit + Übertrag − Verbrauch. `null` bei Töpfen ohne Limit. */
  availableCents: number | null;
  /** Anteil des Verbrauchs am verfügbaren Rahmen, 0..1+. `null` ohne Limit. */
  progress: number | null;
  overspent: boolean;
}

export interface HouseholdSummary {
  periodKey: string;
  incomeCents: number;
  expenseCents: number;
  /** Einnahmen minus Ausgaben. Negativ heißt: mehr ausgegeben als eingenommen. */
  balanceCents: number;
  /** Summe der Limits aller nicht archivierten Töpfe mit Limit. */
  plannedCents: number;
  entryCount: number;
}

function isActive(entry: Entry): boolean {
  return entry.deletedAt === null;
}

/**
 * Ob eine Buchung für sich allein gelöscht werden darf.
 *
 * Nein, wenn sie aus einem Einkauf gerechnet wurde. Ihr Betrag ist die Summe
 * der Posten dieses Topfes, und an einer Buchung der Gruppe hängt der Beleg
 * — dieselbe Falle, die `receiptAnchorId` in `lib/domain/purchase.ts`
 * entschärft. Einzeln gelöscht bliebe ein Einkauf zurück, dessen Posten auf
 * eine Buchung zeigen, die es nicht mehr gibt, und im schlechten Fall wäre
 * der Bon weg. Gelöscht wird so eine Buchung über den Einkauf, der alles
 * zusammen entfernt.
 *
 * Hier und nicht in der Oberfläche, weil zwei Stellen dieselbe Regel lesen:
 * die Wischgeste in der Liste und der Löschknopf im Erfassen-Sheet.
 */
export function canDeleteEntryDirectly(entry: Pick<Entry, 'purchaseId'>): boolean {
  return entry.purchaseId == null;
}

/** Buchungen einer Periode — als eigene Funktion, weil sie überall gebraucht wird. */
export function entriesInPeriod(
  entries: readonly Entry[],
  periodKey: string,
  periodStartDay: number,
): Entry[] {
  const period = periodFromKey(periodKey, periodStartDay);
  return entries.filter(
    (entry) => isActive(entry) && entry.date >= period.start && entry.date < period.endExclusive,
  );
}

export function groupEntriesByPot(entries: readonly Entry[]): Map<string, Entry[]> {
  const byPot = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (!isActive(entry) || entry.potId === null) continue;
    const list = byPot.get(entry.potId);
    if (list) list.push(entry);
    else byPot.set(entry.potId, [entry]);
  }
  return byPot;
}

interface NetResult {
  spentCents: number;
  refundCents: number;
  netCents: number;
}

function netForPeriod(
  entries: readonly Entry[],
  periodKey: string,
  periodStartDay: number,
): NetResult {
  let spentCents = 0;
  let refundCents = 0;
  for (const entry of entriesInPeriod(entries, periodKey, periodStartDay)) {
    if (entry.kind === 'expense') spentCents += entry.amountCents;
    else refundCents += entry.amountCents;
  }
  return { spentCents, refundCents, netCents: spentCents - refundCents };
}

/**
 * Übertrag aus allen Perioden seit Anlage des Topfes.
 *
 * Bekannte Vereinfachung: Für vergangene Perioden wird das **aktuelle** Limit
 * angesetzt, weil keine Limit-Historie gespeichert wird. Wer das Limit ändert,
 * ändert damit rückwirkend den Übertrag. Eine Historie wäre für v1 zu viel
 * Aufwand für den Nutzen; der Wechsel wäre ein zusätzliches Feld
 * `limitHistory` auf dem Topf.
 */
export function computeCarryOverCents(
  pot: Pot,
  entriesOfPot: readonly Entry[],
  periodKey: string,
  periodStartDay: number,
): number {
  if (!pot.carryOver || !hasLimit(pot)) return 0;

  const firstKey = periodForDate(isoDateOf(pot.createdAt), periodStartDay).key;
  const distance = periodDistance(firstKey, periodKey);
  if (distance <= 0) return 0;

  const periodsToWalk = Math.min(distance, MAX_CARRY_PERIODS);
  const startKey = shiftPeriodKey(periodKey, -periodsToWalk);

  let carried = 0;
  for (let offset = 0; offset < periodsToWalk; offset += 1) {
    const key = shiftPeriodKey(startKey, offset);
    const { netCents } = netForPeriod(entriesOfPot, key, periodStartDay);
    carried += pot.limitCents - netCents;
  }
  return carried;
}

export function computePotPeriodState(
  pot: Pot,
  entriesOfPot: readonly Entry[],
  periodKey: string,
  periodStartDay: number,
): PotPeriodState {
  const { spentCents, refundCents, netCents } = netForPeriod(
    entriesOfPot,
    periodKey,
    periodStartDay,
  );
  const carriedInCents = computeCarryOverCents(pot, entriesOfPot, periodKey, periodStartDay);

  if (!hasLimit(pot)) {
    return {
      potId: pot.id,
      periodKey,
      spentCents,
      refundCents,
      netCents,
      limitCents: null,
      carriedInCents: 0,
      availableCents: null,
      progress: null,
      overspent: false,
    };
  }

  const frameCents = pot.limitCents + carriedInCents;
  const availableCents = frameCents - netCents;
  return {
    potId: pot.id,
    periodKey,
    spentCents,
    refundCents,
    netCents,
    limitCents: pot.limitCents,
    carriedInCents,
    availableCents,
    progress: frameCents > 0 ? netCents / frameCents : netCents > 0 ? 1 : 0,
    overspent: availableCents < 0,
  };
}

export interface GoalState {
  potId: string;
  /** Summe aller Buchungen dieses Topfes über seine gesamte Lebenszeit. */
  savedCents: number;
  goalCents: number | null;
  /** `null`, solange kein Zielbetrag gesetzt ist. */
  remainingCents: number | null;
  /** 0–1, für den Balken geklemmt. `null` ohne Zielbetrag. */
  progress: number | null;
  locked: boolean;
}

/**
 * Fortschritt eines Sparziel-Topfes — **nicht** periodengebunden, anders als
 * `computePotPeriodState`: Ein Sparziel läuft über die gesamte Lebenszeit des
 * Topfes bis zur Frist, nicht über eine einzelne Periode. `entriesOfPot`
 * unverändert über alle Perioden hinweg (wie aus `groupEntriesByPot`).
 *
 * **Eine Ausgabe zählt als Einzahlung, eine Einnahme als Entnahme** — genau
 * dieselbe Vorzeichen-Richtung wie `netCents` bei jedem anderen Topf. Das ist
 * kein Sonderfall: Auf einen Topf zu buchen heißt in dieser Anwendung immer
 * „Ausgabe", und der Topf-Schritt beim Erfassen erscheint nur bei Ausgaben
 * (`EntrySheet.potStepActive`) — eine Einnahme ließe sich also gar nicht
 * gezielt einem Sparziel zuordnen. Für „Geld beiseitelegen" bucht man wie für
 * jeden anderen Topf auch: eine Ausgabe auf „Urlaub".
 */
export function computeGoalState(
  pot: Pick<Pot, 'id' | 'goalCents' | 'lockedAt'>,
  entriesOfPot: readonly Entry[],
): GoalState {
  let savedCents = 0;
  for (const entry of entriesOfPot) {
    savedCents += entry.kind === 'expense' ? entry.amountCents : -entry.amountCents;
  }

  const goalCents = pot.goalCents;
  const remainingCents = goalCents === null ? null : goalCents - savedCents;
  const progress =
    goalCents === null
      ? null
      : goalCents > 0
        ? Math.min(1, Math.max(0, savedCents / goalCents))
        : savedCents > 0
          ? 1
          : 0;

  return {
    potId: pot.id,
    savedCents,
    goalCents,
    remainingCents,
    progress,
    locked: pot.lockedAt !== null,
  };
}

/** Zustände aller Töpfe für eine Periode. Gruppiert die Buchungen genau einmal. */
export function computePotStates(
  pots: readonly Pot[],
  entries: readonly Entry[],
  periodKey: string,
  periodStartDay: number,
): PotPeriodState[] {
  const byPot = groupEntriesByPot(entries);
  return pots.map((pot) =>
    computePotPeriodState(pot, byPot.get(pot.id) ?? [], periodKey, periodStartDay),
  );
}

export function computeHouseholdSummary(
  pots: readonly Pot[],
  entries: readonly Entry[],
  periodKey: string,
  periodStartDay: number,
): HouseholdSummary {
  const inPeriod = entriesInPeriod(entries, periodKey, periodStartDay);
  let incomeCents = 0;
  let expenseCents = 0;
  for (const entry of inPeriod) {
    if (entry.kind === 'income') incomeCents += entry.amountCents;
    else expenseCents += entry.amountCents;
  }
  const plannedCents = pots
    .filter((pot) => pot.archivedAt === null && pot.deletedAt === null && hasLimit(pot))
    .reduce((total, pot) => total + (pot.limitCents ?? 0), 0);

  return {
    periodKey,
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    plannedCents,
    entryCount: inPeriod.length,
  };
}

export interface PotShare {
  potId: string | null;
  netCents: number;
  share: number;
}

/** Ausgabenanteil je Topf in einer Periode, absteigend. `null` = ohne Topf. */
export function spendingByPot(
  entries: readonly Entry[],
  periodKey: string,
  periodStartDay: number,
): PotShare[] {
  const totals = new Map<string | null, number>();
  for (const entry of entriesInPeriod(entries, periodKey, periodStartDay)) {
    if (entry.kind !== 'expense') continue;
    totals.set(entry.potId, (totals.get(entry.potId) ?? 0) + entry.amountCents);
  }
  const overall = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([potId, netCents]) => ({
      potId,
      netCents,
      share: overall > 0 ? netCents / overall : 0,
    }))
    .sort((a, b) => b.netCents - a.netCents);
}

export interface PeriodTotals {
  periodKey: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

/** Einnahmen/Ausgaben je Periode — Datengrundlage des Verlaufscharts. */
export function periodTotals(
  entries: readonly Entry[],
  periodKeys: readonly string[],
  periodStartDay: number,
): PeriodTotals[] {
  return periodKeys.map((periodKey) => {
    let incomeCents = 0;
    let expenseCents = 0;
    for (const entry of entriesInPeriod(entries, periodKey, periodStartDay)) {
      if (entry.kind === 'income') incomeCents += entry.amountCents;
      else expenseCents += entry.amountCents;
    }
    return { periodKey, incomeCents, expenseCents, balanceCents: incomeCents - expenseCents };
  });
}

function isoDateOf(timestamp: IsoDateTime): string {
  return timestamp.slice(0, 10);
}
