/**
 * Datenmodell der Anwendung.
 *
 * Zwei Entscheidungen prägen alles Weitere:
 *
 * 1. **Beträge sind Integer-Cent.** Nie `number` als Euro, nie Fließkomma.
 *    `amountCents` ist immer positiv; das Vorzeichen ergibt sich aus `kind`.
 * 2. **Jeder Record trägt Sync-Metadaten** (`id` clientseitig erzeugt,
 *    `updatedAt`, `revision`, `deletedAt`). Ohne diese Felder ist eine spätere
 *    Synchronisation gegen eine zentrale DB nicht nachrüstbar, ohne die
 *    bestehenden Daten zu verlieren.
 */

/** Kalendertag, 'YYYY-MM-DD'. */
export type IsoDate = string;
/** Zeitpunkt, ISO 8601 in UTC. */
export type IsoDateTime = string;

export type Role = 'admin' | 'member' | 'viewer';

/** Art eines Topfes. Ein Preset über den flexiblen Feldern `limitCents`/`carryOver`. */
export type PotKind = 'budget' | 'envelope' | 'category';

export type EntryKind = 'expense' | 'income';

export type Frequency = 'weekly' | 'monthly' | 'yearly';

/** Metadaten jedes haushaltsgebundenen Records. */
export interface RecordMeta {
  id: string;
  householdId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Wird bei jeder Änderung erhöht. Grundlage für Konfliktauflösung beim Sync. */
  revision: number;
  /** Soft Delete — ein späterer Sync muss Löschungen übertragen können. */
  deletedAt: IsoDateTime | null;
}

export interface Household {
  id: string;
  name: string;
  /** ISO-4217, z. B. 'EUR'. */
  currency: string;
  /** BCP-47, z. B. 'de-DE'. Steuert Formatierung von Geld und Datum. */
  locale: string;
  /** Tag im Monat, an dem eine Budgetperiode beginnt (1–28). */
  periodStartDay: number;
  onboardingCompletedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  revision: number;
}

export interface User extends RecordMeta {
  displayName: string;
  role: Role;
  /**
   * Reserviert für den OIDC-`sub` nach Einführung von SSO. In v1 immer `null`,
   * weil es keine Anmeldung gibt.
   */
  externalSubject: string | null;
  /** Der Nutzer, als der dieses Gerät ohne Anmeldung arbeitet. */
  isLocalDevice: boolean;
}

export interface Pot extends RecordMeta {
  name: string;
  /** Kurzes Emoji als Symbol — braucht keine Icon-Bibliothek. */
  icon: string;
  /** Name eines Farb-Tokens aus `lib/ui/colors.ts`. */
  color: string;
  kind: PotKind;
  /** Monatslimit in Cent. `null` bedeutet: kein Limit (reine Kategorie). */
  limitCents: number | null;
  /** Nimmt Restbetrag bzw. Überziehung in die nächste Periode mit. */
  carryOver: boolean;
  sortIndex: number;
  archivedAt: IsoDateTime | null;
}

export interface Entry extends RecordMeta {
  /** `null` = nicht zugeordnet (z. B. Einnahme auf den Haushalt). */
  potId: string | null;
  kind: EntryKind;
  /** Immer positiv. Das Vorzeichen steckt in `kind`. */
  amountCents: number;
  date: IsoDate;
  note: string | null;
  merchant: string | null;
  /** Gesetzt, wenn die Buchung aus einer wiederkehrenden Regel entstand. */
  recurringRuleId: string | null;
  /**
   * Klammert die Buchungen, die aus **einem** Kassenbon entstanden sind.
   *
   * Ein Einkauf, der auf drei Töpfe geht, muss drei Buchungen werden — sonst
   * stimmt die Auswertung nicht. Damit er in der Liste trotzdem als ein
   * Einkauf erkennbar bleibt, tragen alle drei dieselbe Kennung. Nicht
   * indiziert: Gruppiert wird über den Snapshot, der ohnehin vollständig im
   * Speicher liegt.
   */
  splitGroupId: string | null;
  createdBy: string;
}

/**
 * Gelernte Zuordnung „Schlagwort → Topf".
 *
 * Ohne dieses Gedächtnis wäre das Aufteilen eines Bons eine Rechenaufgabe pro
 * Einkauf und damit mühsamer als eine getippte Summe. Mit ihm ist der zweite
 * Einkauf beim selben Händler fast fertig vorbelegt.
 *
 * Gehört zum Haushalt, nicht zum Gerät: Wer die Regeln gelernt hat, soll sie
 * nach einem Gerätewechsel wiederhaben — sie stehen deshalb in der Sicherung.
 */
export interface ItemRule extends RecordMeta {
  /** Normalisiert über `normalizeKeyword` — klein, ohne Ziffern und Einheiten. */
  keyword: string;
  potId: string;
}

export interface RecurringRule extends RecordMeta {
  potId: string | null;
  kind: EntryKind;
  amountCents: number;
  note: string | null;
  freq: Frequency;
  /** Jede n-te Periode. 1 = jede. */
  interval: number;
  /** Bei 'monthly'/'yearly': Tag im Monat. Größere Werte werden auf das Monatsende geklemmt. */
  dayOfMonth: number | null;
  /** Bei 'weekly': 0 = Sonntag … 6 = Samstag. */
  weekday: number | null;
  /** Bei 'yearly': Monat 1–12. */
  month: number | null;
  startDate: IsoDate;
  endDate: IsoDate | null;
  /** Bis zu diesem Tag wurden Buchungen erzeugt. Macht die Materialisierung idempotent. */
  lastMaterializedDate: IsoDate | null;
  paused: boolean;
}

/** Beleg ohne Binärdaten — für Listen und Übersichten. */
export interface ReceiptMeta extends RecordMeta {
  entryId: string;
  filename: string;
  mime: string;
  byteSize: number;
}

/** Beleg mit Binärdaten. Liegt in einer eigenen Tabelle, damit Buchungs-Queries leicht bleiben. */
export interface Receipt extends ReceiptMeta {
  blob: Blob;
  /** Verkleinerte Vorschau für Listen. `null`, wenn nicht erzeugbar (z. B. PDF). */
  thumbnail: Blob | null;
}

/** Eintrag der Outbox. In v1 nur geschrieben — Grundlage für späteren Sync. */
export interface ChangeLogEntry {
  id: string;
  householdId: string;
  entity: 'household' | 'user' | 'pot' | 'entry' | 'recurringRule' | 'receipt' | 'itemRule';
  entityId: string;
  op: 'upsert' | 'delete';
  revision: number;
  at: IsoDateTime;
}

/** Eingabeform: alles, was der Nutzer angibt, ohne Metadaten. */
export type NewEntryInput = Pick<Entry, 'potId' | 'kind' | 'amountCents' | 'date'> &
  Partial<Pick<Entry, 'note' | 'merchant' | 'recurringRuleId' | 'splitGroupId'>>;

export type NewPotInput = Pick<Pot, 'name' | 'kind' | 'limitCents' | 'carryOver'> &
  Partial<Pick<Pot, 'icon' | 'color' | 'sortIndex'>>;

export type NewRecurringRuleInput = Pick<
  RecurringRule,
  'potId' | 'kind' | 'amountCents' | 'freq' | 'interval' | 'startDate'
> &
  Partial<Pick<RecurringRule, 'note' | 'dayOfMonth' | 'weekday' | 'month' | 'endDate' | 'paused'>>;
