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

/**
 * Art eines Topfes. Ein Preset über den flexiblen Feldern
 * `limitCents`/`carryOver` — außer `goal`, das über eigene Felder
 * (`goalCents`/`targetDate`) läuft, weil ein Sparziel nicht periodisch ist.
 */
export type PotKind = 'budget' | 'envelope' | 'category' | 'goal';

export type EntryKind = 'expense' | 'income';

/** Lebensabschnitt eines Sparziel-Topfes (`kind: 'goal'`). */
export type GoalPhase = 'saving' | 'spending';

export type Frequency = 'weekly' | 'monthly' | 'yearly';

/**
 * Woher die Posten eines Bons kommen — und damit, wie viel Vertrauen
 * angebracht ist. Die Regeln dazu stehen in `lib/domain/receipt-parse.ts`.
 *
 * - `exakt`     aus `ekabs.json`, vom Kassensystem selbst geschrieben
 * - `geprüft`   aus der Textschicht, Posten gehen auf die Endsumme auf
 * - `unsicher`  Posten verworfen; nur Summe und Datum
 */
export type ParseQuality = 'exakt' | 'geprüft' | 'unsicher';

/**
 * Was der schwebende Knopf beim Antippen tut, und für welche Seiten sich das
 * getrennt einstellen lässt. Die Regeln dazu stehen in `lib/domain/fab.ts`;
 * hier stehen nur die Werte, weil `Household` sie trägt.
 */
export type FabAction = 'expense' | 'income' | 'ask';
export type FabScope = 'home' | 'pots' | 'potDetail' | 'entries' | 'recurring' | 'analysis';

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
  /**
   * Topf, auf den eine Ausgabe ohne eigene Zuordnung läuft. `null` = keiner,
   * dann bleibt die Buchung wie bisher ohne Topf.
   *
   * Gesetzt wird das **im Repository** auf dem Schreibweg, nicht in der
   * Oberfläche: Der Bon-Import und später die API gehen an jedem Formular
   * vorbei.
   */
  defaultPotId: string | null;
  /**
   * Ob beim Erfassen nach dem Topf gefragt wird. `false` = direkt in den
   * Standardtopf; der Topf steht dann in den Details und ist dort änderbar.
   */
  askForPot: boolean;
  /** Ob Tags erfasst, gefiltert und ausgewertet werden. */
  tagsEnabled: boolean;
  /**
   * Was der schwebende Knopf beim Antippen tut, wenn der Bereich nichts
   * eigenes sagt. Die Regeln dazu stehen in `lib/domain/fab.ts`.
   *
   * Gehört zum Haushalt und nicht zum Gerät: Es ist eine Aussage darüber, wie
   * dieser Haushalt erfasst — wie `askForPot` — und soll in der Sicherung
   * stehen.
   */
  fabDefault: FabAction;
  /**
   * Abweichungen je Bereich. Ein fehlender Schlüssel heißt „wie überall",
   * nicht „Ausgabe": Wer `fabDefault` später ändert, soll das in allen
   * Bereichen sehen, für die er nichts eigenes eingestellt hat.
   */
  fabScopes: Partial<Record<FabScope, FabAction>>;
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
  /** Zielbetrag eines Sparziel-Topfes (`kind: 'goal'`). Sonst `null`. */
  goalCents: number | null;
  /** Frist eines Sparziel-Topfes. Sonst `null`. */
  targetDate: IsoDate | null;
  /**
   * Wann die Frist automatisch zugeschlagen hat — getrennt von
   * `archivedAt`: Das ist die vom Nutzer gewählte, jederzeit per Knopf
   * umkehrbare Ausblendung; das hier ist eine Sperre, die nur eine neue,
   * in der Zukunft liegende `targetDate` wieder aufhebt.
   */
  lockedAt: IsoDateTime | null;
  /**
   * Lebensabschnitt eines Sparziel-Topfes (`kind: 'goal'`). Sonst `null`.
   *
   * Steuert ausschließlich, welche Buchungsart vorbelegt wird und welches
   * Wort dafür erscheint — an der Rechnung in `computeGoalState` ändert sie
   * nichts: Einzahlung und Auszahlung unterscheiden sich schon an
   * `Entry.kind`. Töpfe aus der Zeit vor diesem Feld lesen es als
   * `undefined`; `goalPhaseOf` in `lib/domain/pot-kinds.ts` fängt das als
   * `'saving'` ab.
   */
  goalPhase: GoalPhase | null;
}

export interface Entry extends RecordMeta {
  /** `null` = nicht zugeordnet (z. B. Einnahme auf den Haushalt). */
  potId: string | null;
  kind: EntryKind;
  /** Immer positiv. Das Vorzeichen steckt in `kind`. */
  amountCents: number;
  date: IsoDate;
  note: string | null;
  /**
   * Der Name des Ladens oder der Firma — in der Oberfläche „Firma".
   *
   * Hieß dort früher „Wo?" und trug beides. Seit es `address` gibt, trägt
   * dieses Feld nur noch den Namen; bestehende Buchungen bleiben damit
   * richtig, denn der Bon-Import schrieb hier schon immer den Händlernamen.
   */
  merchant: string | null;
  /**
   * Die vollständige Anschrift — in der Oberfläche „Wo?".
   *
   * Angezeigt wird sie gekürzt (`lib/domain/address.ts`) und mobil als
   * `geo:`-Verweis, der sie an die Karten-Anwendung des Geräts übergibt.
   * Nicht indiziert, gesucht wird über den Snapshot — wie bei `tags`.
   */
  address: string | null;
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
  /**
   * Freie Marken zum Nachverfolgen quer zu den Töpfen („Urlaub", „Umzug").
   *
   * Liegen an der Buchung und nicht in einer eigenen Tabelle — Begründung und
   * die Regeln zum Vergleichen stehen in `lib/domain/tags.ts`. Nicht
   * indiziert: Gefiltert wird über den Snapshot, der ohnehin im Speicher liegt.
   */
  tags: string[];
  /**
   * Der Einkauf, aus dessen Posten diese Buchung gerechnet wurde.
   *
   * `null` bei allem, was von Hand erfasst wurde — und bei Bons, die vor der
   * Einführung der Posten gebucht wurden. Ihr Betrag ist dann das, was da
   * steht; es gibt nichts, woraus er sich nachrechnen ließe.
   *
   * Nicht indiziert, wie `splitGroupId`: Zugeordnet wird über den Snapshot.
   */
  purchaseId: string | null;
  createdBy: string;
}

/**
 * Ein Einkauf — die Klammer um die Posten eines Bons.
 *
 * Getrennt von der Buchung, weil ein Bon auf mehrere Töpfe geht und damit
 * mehrere Buchungen erzeugt. Der Einkauf ist das, was es **einmal** gibt: ein
 * Händler, ein Datum, eine Endsumme.
 *
 * **Der Beleg hängt nicht hier**, sondern wie bisher an einer Buchung
 * (`Receipt.entryId`). Eine zweite Stelle, an der derselbe Bon steht, wären
 * zwei Wahrheiten — und die Buchung ist die, die es schon gibt.
 */
export interface Purchase extends RecordMeta {
  merchant: string | null;
  date: IsoDate;
  /**
   * Die auf dem Bon **erkannte** Endsumme — nicht die Summe der Posten.
   *
   * Der Unterschied ist der ganze Punkt: Nur wenn beide übereinstimmen, ist
   * die Aufteilung belegt. `null`, wenn keine Summe zu finden war.
   */
  totalCents: number | null;
  quality: ParseQuality;
  /**
   * Tags des ganzen Einkaufs. Stehen hier und nicht nur an den Buchungen,
   * weil die Buchungen aus den Posten **neu gerechnet** werden: Wüsste der
   * Einkauf sie nicht, wären sie nach dem ersten Umhängen eines Postens weg,
   * ohne dass jemand sie gelöscht hätte.
   */
  tags: string[];
}

/**
 * Eine Artikelzeile eines Bons.
 *
 * Änderbar sind nur `potId` und `tags`. Betrag und Bezeichnung stehen so auf
 * dem Beleg; ließe man sie ändern, wäre die Summenprobe keine Aussage mehr
 * über den Bon, sondern über eine nachbearbeitete Liste.
 */
export interface PurchaseItem extends RecordMeta {
  purchaseId: string;
  label: string;
  /**
   * **Vorzeichenbehaftet**, anders als `Entry.amountCents`: Rabatt und
   * Pfandrückgabe sind negativ, genau wie in `ParsedItem`. Erst beim
   * Zusammenfassen zu einer Buchung wird daraus Betrag plus `kind`.
   */
  amountCents: number;
  quantity: number | null;
  potId: string | null;
  tags: string[];
  sortIndex: number;
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
  entity:
    | 'household'
    | 'user'
    | 'pot'
    | 'entry'
    | 'recurringRule'
    | 'receipt'
    | 'itemRule'
    | 'purchase'
    | 'purchaseItem';
  entityId: string;
  op: 'upsert' | 'delete';
  revision: number;
  at: IsoDateTime;
}

/** Eingabeform: alles, was der Nutzer angibt, ohne Metadaten. */
export type NewEntryInput = Pick<Entry, 'potId' | 'kind' | 'amountCents' | 'date'> &
  Partial<
    Pick<
      Entry,
      'note' | 'merchant' | 'address' | 'recurringRuleId' | 'splitGroupId' | 'tags' | 'purchaseId'
    >
  >;

/** Ein Einkauf samt seiner Posten, so wie der Bon-Import ihn übergibt. */
export type NewPurchaseInput = Pick<Purchase, 'merchant' | 'date' | 'totalCents' | 'quality'> & {
  items: readonly NewPurchaseItemInput[];
  /** Tags des ganzen Einkaufs. Jede entstehende Buchung bekommt sie. */
  tags?: string[];
};

export type NewPurchaseItemInput = Pick<PurchaseItem, 'label' | 'amountCents'> &
  Partial<Pick<PurchaseItem, 'quantity' | 'potId' | 'tags'>>;

export type NewPotInput = Pick<Pot, 'name' | 'kind' | 'limitCents' | 'carryOver'> &
  Partial<Pick<Pot, 'icon' | 'color' | 'sortIndex' | 'goalCents' | 'targetDate' | 'goalPhase'>>;

export type NewRecurringRuleInput = Pick<
  RecurringRule,
  'potId' | 'kind' | 'amountCents' | 'freq' | 'interval' | 'startDate'
> &
  Partial<Pick<RecurringRule, 'note' | 'dayOfMonth' | 'weekday' | 'month' | 'endDate' | 'paused'>>;
