<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Haushaltsplanung — Regeln für dieses Projekt

Alles oberhalb der Trennlinie verwaltet `next dev` zwischen seinen Markern und
schreibt es bei Bedarf neu. Alles darunter bleibt stehen (nachzulesen in
`upsertAgentRulesBlock` in `node_modules/next/dist/server/lib/generate-agent-files.js`,
das ausschließlich den Bereich zwischen den Markern ersetzt).

## Was die Anwendung ist

Haushaltsplanung mit „Töpfen": Ausgaben werden auf Bereiche wie Lebensmittel
oder Sport gebucht, die App zeigt, wie viel dort noch übrig ist. Version 1
speichert **ausschließlich auf dem Gerät** (IndexedDB), ohne Konto und ohne
Server. Zentrale Datenhaltung und SSO sind vorbereitet, aber nicht
eingeschaltet — der Umbauweg steht in `docs/roadmap-server.md`.

## Belege: was mit ihnen passiert und was nicht

**Ein Foto wird nicht ausgelesen.** Es wird gespeichert und angezeigt, sonst
nichts. Keine Texterkennung, kein OCR, keine Auswertung des Inhalts — das war
von Anfang an die Zusage und bleibt es.

**Ein PDF-Bon wird gelesen**, aber nur auf Anstoß („Aus PDF-Bon einlesen") und
nur auf dem Gerät: `lib/pdf/extract.ts` holt Anhänge und Textschicht,
`lib/domain/receipt-parse.ts` macht daraus Posten.

Darüber steht **die Summenprobe**: Posten werden nur angeboten, wenn sie auf
die erkannte Endsumme aufgehen (`quality: 'geprüft'`) oder aus der angehängten
`ekabs.json` stammen (`'exakt'`). Gehen sie nicht auf, gibt es keine
Postenliste, sondern nur Summe und Datum. Wer diese Regel aufweicht, tauscht
einen sichtbaren Mangel gegen einen unsichtbaren Fehler: Ein falsch
aufgeteilter Einkauf sieht richtig aus.

Ändert sich das, ist `app/datenschutz/page.tsx` mitzuändern — dort steht
belegbar, was mit einem Beleg geschieht.

## Die fünf Regeln, die das Projekt zusammenhalten

1. **`lib/domain` kennt weder React noch Storage.** Dort liegt die Rechenlogik
   (Geld, Perioden, Topf-Arten, Restbeträge, Termine) als reine Funktionen,
   und dort liegen ihre Tests. Neue Logik, die sich still verrechnen kann,
   gehört hierhin und nicht in eine Komponente.
2. **Kein Zugriff auf Dexie außerhalb von `lib/data/local`.** Alles läuft über
   `useSnapshot()` / `useRepository()` gegen das `BudgetRepository`-Interface.
   Eine `no-restricted-imports`-Regel in `eslint.config.mjs` erzwingt das. Das
   ist der Hebel, der den späteren Wechsel auf eine zentrale DB billig macht —
   wer ihn umgeht, macht den Umbau teuer.
3. **Beträge sind Integer-Cent.** Nie Euro als `number`, nie Fließkomma.
   `lib/domain/money.ts` kapselt Parsen, Formatieren und Summieren.
4. **Rechte werden im Repository geprüft, nicht in der Oberfläche.** Knöpfe
   auszublenden ist Bequemlichkeit; `assertCan()` im Adapter ist die Regel —
   und genau diese Stelle wandert später unverändert in den Server.
5. **Jeder neue Datensatz trägt Sync-Metadaten** (`id` clientseitig erzeugt,
   `revision`, `updatedAt`, `deletedAt`) und schreibt bei jeder Mutation in
   derselben Transaktion eine Zeile in die Outbox-Tabelle `changeLog`. In v1
   liest die niemand; ohne sie ist späterer Sync nicht nachrüstbar.

## Standardtopf und Tags

Zwei Einstellungen am **Haushalt** (nicht am Gerät — sie stehen in der
Sicherung und verweisen auf Töpfe dieses Haushalts):

- **`defaultPotId` ist ein Auffangnetz, und es hängt im Repository.** Eine
  Ausgabe ohne Zuordnung bekommt den Standardtopf in `createEntries` und in
  `materializeRecurringRules` — nicht im Formular. Der Bon-Import und die
  künftige API gehen an jedem Formular vorbei; eine Regel in der Oberfläche
  wäre eine Regel mit Löchern. Nur Ausgaben (Einnahmen laufen auf den
  Haushalt), nur beim **Anlegen** (wer beim Bearbeiten „Kein Topf" wählt, meint
  das), und nur wenn der Topf noch existiert. Wird er gelöscht oder
  archiviert, räumt `detachDefaultPot` das Feld in derselben Transaktion.
- **`askForPot` schaltet den Topf-Schritt beim Erfassen aus**, nicht die
  Zuordnung: `EntrySheet` belegt dann den Standardtopf vor und zeigt ihn in den
  Details mit „Topf ändern". Ein stumm gesetzter Topf wäre beim Auswerten eine
  Überraschung.

**Tags** (`tagsEnabled`, Feld `Entry.tags`) sind die zweite Achse neben den
Töpfen. Die Regeln stehen in `lib/domain/tags.ts`:

- Verglichen wird über `tagKey()` (klein geschrieben), angezeigt die
  geschriebene Form. „Urlaub" und „urlaub" sind derselbe Tag.
- Tags liegen **an der Buchung**, nicht in einer eigenen Tabelle: ein
  Schreibweg, eine Outbox-Zeile, Vorschläge aus dem Bestand. Der Preis sind die
  Sammeloperationen `renameTag`/`deleteTag` im Repository — in **einer**
  Transaktion, mit `revision`-Erhöhung je berührter Buchung. Eine Schleife in
  der Oberfläche wäre beim Abbruch halb fertig.
- Nicht indiziert, gefiltert wird über den Snapshot — wie bei `splitGroupId`.
- **Die Summen je Tag addieren sich nicht zur Gesamtsumme**, weil eine Buchung
  mehrere tragen kann. Die Auswertung schreibt das dazu; wer den Satz entfernt,
  hinterlässt Zahlen, die sich nicht erklären lassen.
- Ein Bon kann Tags für den ganzen Einkauf **und** je Posten haben. Weil daraus
  eine Buchung pro Topf wird, sammelt jede Buchung die Tags ihrer Posten ein —
  über `indices` aus `groupItemsByPot`, damit die Gruppierung nicht zweimal
  existiert.

Neue Felder am `Household` brauchen keine Dexie-Migration (nicht indiziert),
aber einen Standardwert in `withHouseholdDefaults` **und** im `householdSchema`
— sonst ist das Feld bei bestehenden Installationen `undefined` (also unwahr)
und ältere Sicherungen lassen sich nicht mehr einlesen.

## Ersteinrichtung

`components/onboarding/OnboardingWizard.tsx` — eine Frage pro Bildschirm, acht
Schritte: Name, Währung/Periode, Einkommen, Betragsart, dann je ein eigener
Schritt für die vier Vorschlags-Töpfe. Ein `useState`-Baum, keine Unterteilung
in Unterkomponenten — die Schritte sind zu verschieden (Textfeld, Auswahl,
Betrag, Topf-Vorschau), um eine gemeinsame Abstraktion zu lohnen.

- **Genau vier Vorschläge, einer je Topf-Art**
  (`components/onboarding/suggested-pots.ts`): Lebensmittel (Monatsbudget),
  Haushalt (Nur Kategorie), Hobby (Budget mit Übertrag), Urlaub (Sparziel).
  Lebensmittel/Haushalt sind voraktiviert, Hobby/Urlaub nicht — sie sind
  Beispiele für die beiden Arten, die sonst kein Vorschlag zeigen würde.
- **Nur `lebensmittel` ist mit `lib/domain/pot-categories.ts` verknüpft**
  (`POT_CATEGORY_NAMES.lebensmittel`), weil nur dorthin ein mitgeliefertes
  Bon-Profil zielt. `haushalt`/`hobby`/`urlaub` sind freie Namen ohne
  Bon-Profil-Bezug — `SuggestedPot.key` ist deshalb ein eigener Typ
  (`OnboardingPotKey`), nicht `PotCategory`. Die Kategorien-Namen selbst
  (`wohnen`, `mobilitaet`, `sport`, `freizeit`, `sonstiges`) bleiben in
  `pot-categories.ts` unverändert stehen — sie sind weiter das Ziel echter
  Bon-Profile, nur legt die Ersteinrichtung diese Töpfe nicht mehr automatisch
  an. Ein Topf mit demselben Namen von Hand angelegt bekommt die Vorschläge
  trotzdem, weil `resolveCategoryPot` über den Namen sucht, nicht über eine
  Herkunft.
- **Ein Vorschlagsname darf nicht mit fester Oberflächen-Beschriftung
  kollidieren.** „Haushalt" ist zugleich die App-Beschriftung der
  Seitenleiste (`AppShell.tsx`, `hidden md:flex` — auf dem Telefon also im
  Baum, aber unsichtbar). Ein `getByText('Haushalt')` in einem E2E-Test trifft
  dort zuerst, nicht die Buchungszeile — deshalb zielen solche Prüfungen über
  eine Rolle (`getByRole('button', …)`), nicht über freien Text. Wer einen
  weiteren Vorschlagsnamen ergänzt, prüft kurz, ob er anderswo als feste
  Beschriftung vorkommt.
- **Einkommen steht vor den Töpfen, nicht danach.** Die Betragsart „Fest"
  rechnet einen Anteil vom Einkommen (`lib/domain/onboarding-budget.ts`,
  `amountFromIncomePercent`) — ohne Einkommen bliebe nur „Frei", und die
  Reihenfolge macht diese Abhängigkeit sichtbar statt sie zu verstecken. Ohne
  Einkommen ist „Fest" im Betragsart-Schritt ausgegraut, nicht versteckt: Der
  Grund soll sichtbar bleiben.
- **Der Anteil gilt nur für Lebensmittel und Hobby** — die beiden Vorschläge
  mit einem Periodenlimit. Haushalt hat als „Nur Kategorie" kein Limit, auf
  das sich ein Anteil anwenden ließe; Urlaub hat einen Zielbetrag über die
  gesamte Lebenszeit des Topfes, keinen Periodenanteil, und bekommt deshalb
  einen festen Vorschlag unabhängig vom Einkommen.
- **Ein Topf-Schritt belegt seinen Betrag nur vor, solange er unberührt
  ist** (`PotStepState.touched`). Ändert der Nutzer Einkommen oder Betragsart
  nachträglich über „Zurück" und durchläuft die Schritte erneut, aktualisiert
  sich nur, was er noch nicht selbst angefasst hat — eine Eingabe geht nicht
  verloren, nur weil weiter vorn etwas anders gewählt wurde.
- **Ein Umschalter „Diesen Topf anlegen" ist das Überspringen.** Kein
  zweiter, eigener Knopf dafür — aus heißt: Beim Abschließen wird dieser Topf
  nicht angelegt, alle anderen Schritte bleiben unverändert erreichbar.

**Topf-Eigenschaften lassen sich auch aus den Einstellungen heraus ändern.**
`app/einstellungen/toepfe/page.tsx` öffnet beim Antippen einer Zeile direkt
das vorhandene Bearbeiten-Sheet (`PotSettingsForm`) — kein Umweg mehr über die
Detailseite. Bewusst nur die Eigenschaften (Name, Art, Limit, Symbol, Farbe):
Buchungen, wiederkehrende Regeln, Archivieren und Löschen bleiben auf der
Detailseite, wo der Kontext (Verlauf, Buchungsliste) tatsächlich steht. Die
Seite hält dafür die **ID** des zu bearbeitenden Topfes, nicht den Topf
selbst — sonst zeigte das Sheet nach dem Speichern weiter den alten Stand,
weil eine gehaltene Objektreferenz keine neue Revision aus dem Snapshot zieht.

## Deployment

Die App läuft auf GitHub Pages unter einem **Unterpfad**
(`/budget-calculator`). Daraus folgt:

- `NEXT_PUBLIC_BASE_PATH` nicht fest verdrahten. Lokal und im Test ist sie
  leer, der Workflow setzt sie.
- `next/link` bekommt den Präfix automatisch. Dateien aus `public/` und die
  URLs aus dem Metadata-Export **nicht** — dafür gibt es `lib/base-path.ts`.
- `public/manifest.webmanifest` benutzt relative URLs, `public/sw.js` leitet
  seinen Präfix aus der eigenen Adresse ab. Beides bewusst so, damit keine
  Datei beim Build erzeugt werden muss.
- Wer eine neue Route hinzufügt, die offline erreichbar sein soll, trägt sie in
  `APP_SHELL` in `public/sw.js` nach.
- **Cache-first nur für Dateien mit Hash im Namen** (`_next/static/…`, Symbole).
  Alles andere holt `public/sw.js` erst aus dem Netz. Der statische Export
  enthält nicht gehashte RSC-Nutzlasten (`index.txt`, `__next.*.txt`), die der
  Router bei jedem Wechsel innerhalb der App lädt — lagen die cache-first, war
  nach einem Deploy die Hülle neu und jede Unterseite alt. Wer die Strategie
  anfasst, prüft diesen Fall.
- Der Deploy-Workflow setzt `NEXT_PUBLIC_BUILD_VERSION` auf den Commit und
  schreibt dieselbe Kennung nach `out/version.json`. `components/UpdateNotice.tsx`
  vergleicht beides und zeigt eine Hinweisleiste. Lokal ist die Variable leer,
  dann ist die Prüfung aus — im E2E-Lauf darf keine Leiste Klicks abfangen.

## Was Claude Code nicht lesen soll

`.claude/settings.json` liegt im Repository und sperrt per `permissions.deny`
die Dateien, deren Inhalt niemandem hilft und die viel Kontext kosten:
`package-lock.json`, die PDF-Muster, Build-Ausgaben (`.next/`, `out/_next/`),
Testartefakte und die Karten- bzw. wasm-Dateien in `node_modules`.

Drei Dinge dazu, die beim Anlegen geprüft wurden:

- **Es gibt kein `.claudeignore`.** Der Feature-Wunsch dafür ist geschlossen,
  und eine Datei mit dem Namen verhindert nachweislich keine Lesezugriffe.
  `permissions.deny` ist der Weg
  ([Doku](https://code.claude.com/docs/en/permissions)).
- **`node_modules` ist absichtlich nicht als Ganzes gesperrt.** Die Regel ganz
  oben in dieser Datei verlangt, vor Next-Code die Anleitung in
  `node_modules/next/dist/docs/` zu lesen, und die Typen einer Bibliothek
  nachzusehen ist oft der kürzeste Weg zur Wahrheit. Eine Sperre auf das ganze
  Verzeichnis ließe sich auch nicht aufbohren: Eine `allow`-Regel kann aus
  einer `deny`-Regel keine Ausnahme schneiden, und eine
  `!`-Ausnahme greift nicht in ein Verzeichnis, das als Ganzes gesperrt ist.
- **Eine `Read`-Sperre wirkt weiter als die Doku sagt.** Sie sperrt `Edit` und
  `Write` auf demselben Pfad — das ist dokumentiert. Sie sperrt aber auch
  **Bash-Befehle, deren Argumente auf einen gesperrten Pfad zeigen**: In der
  Sitzung, die diese Liste angelegt hat, wurden ein `grep` auf
  `node_modules/**/*.min.mjs` und das `cp` des pdf.js-Workers nach
  `public/vendor/` abgelehnt. Genau deshalb stehen diese beiden Muster **nicht**
  in der Liste: Sie blockierten die Pflege, die `lib/pdf/extract.ts` als Befehl
  dokumentiert. Wer eine Regel ergänzt, prüft, ob ein Wartungsbefehl über
  denselben Pfad läuft — die PDF-Muster etwa erzeugt
  `node e2e/fixtures/build.mjs`, das schreibt nach `e2e/fixtures/`, nicht in die
  gesperrten `*.pdf` hinein.

Was die Sperre **nicht** leistet: `Grep` hält sich schon über `.gitignore` von
`node_modules` fern, `Glob` liefert dort weiter Pfade (billig, es sind nur
Namen), und der große Kostenpunkt bleibt, was bewusst gelesen wird. Die Liste
verhindert Versehen, keine Arbeit.

## Vor jedem Push

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Bei Änderungen an Manifest, Icons, Service Worker oder Routing zusätzlich den
Unterpfad-Build prüfen — er ist der, der veröffentlicht wird:

```bash
NEXT_PUBLIC_BASE_PATH=/budget-calculator npm run build
```

Der E2E-Test läuft gegen das gebaute Bundle, nicht gegen `next dev` (das
Dev-Overlay fängt mobil die Klicks auf die untere Navigation ab):

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

## Anmeldung vor der App

`components/LoginGate.tsx` steht vor dem Inhalt und nimmt `admin`/`admin`
(änderbar über `NEXT_PUBLIC_APP_USER`/`_PASSWORD`).

**Das ist kein Zugriffsschutz** und darf im Code, in der Doku und gegenüber
Nutzern auch nicht so genannt werden: Die Seite ist ein statisches Bundle,
jede Datei wird an jeden ausgeliefert, und das Passwort steht im
ausgelieferten JavaScript. Es hält Gelegenheitsbesucher ab, mehr nicht.
Deshalb auch kein Hashing — das würde Sicherheit vortäuschen, wo der Klartext
daneben steht.

Echter Schutz wäre eine serverseitige Abfrage vor der Auslieferung und damit
ein anderes Hosting; siehe `STATE.md`.

Das Gate steht **hinter** der Ausnahme für die Rechtsseiten in
`components/AppGate.tsx`: Ein Impressum hinter einer Anmeldung wäre nicht ohne
Hürde erreichbar.

## Mobile Oberfläche

- **Keine Kopfzeile.** Die oberste Bildschirmzeile gehört dem Inhalt; `main`
  trägt `pt-[max(…,env(safe-area-inset-top))]`, damit als installierte App
  nichts unter der Statusleiste liegt.
- **Vier Ziele in der unteren Leiste**: Heute, Buchungen, Auswertung,
  Einstellungen. „Töpfe" steht bewusst nicht dort — angelegt wird über die
  Zeile „Neuer Topf" auf „Heute", verwaltet über den Link in den
  Einstellungen. Wer einen fünften Eintrag ergänzen will, prüft ihn vorher bei
  320 px Breite.
- **Erfassen läuft über den schwebenden Knopf** (`QuickEntryButton`), der
  `EntrySheet` mit `lockKind` öffnet — Einzelheiten im Abschnitt „Schwebender
  Knopf". Seiten-Knöpfe zum Erfassen gibt es nur noch ab `md`. Wer den Knopf
  verschiebt, prüft das `pb-36` am `main` in `AppShell` mit — er endet
  8,25 rem über dem unteren Rand, und darunter darf keine Listenzeile liegen
  bleiben.
- **Über der Buchungsliste kleben zwei Zeilen**: Monat, darunter Tag. Der
  Monat war vorher nicht da, und in einer langen Liste stand dann ein Tag
  ohne Monat darüber. Zwei sind das Maximum — sie kosten zusammen rund
  3,3 rem, eine dritte Ebene wäre bei 320 px mehr Kopf als Inhalt.
- **Impressum und Datenschutz kleben über der unteren Leiste**, sobald sie
  beim Scrollen ins Bild gekommen sind. Und zwar mit `top`, nicht mit
  `bottom`: `bottom` heftet ein Element von Anfang an an den Fensterboden, es
  wäre auf jeder Seite dauerhaft sichtbar und kostete überall eine Zeile.
  Dazu gehört ein Fund, der teuer war: **Ein `sticky` mit `top` schiebt ein
  Element nur bis zum Ende des Inhalts seines Containers** — Polsterung zählt
  nicht dazu. Als letztes Kind eines `main` mit `pb-36` klebte die Leiste
  deshalb nie, obwohl der gerechnete `top`-Wert stimmte. Der Platz steckt nun
  in einem Abstandhalter **nach** der Leiste; wer ihn verkleinert, verkleinert
  das Fenster, in dem sie klebt (`pb` minus `--nav-bar-h`).
- **Suche und Filter liegen hinter je einem Symbol** — in der klebenden Leiste
  über der Liste (`components/lists/ListToolbar.tsx`), an jeder Breite gleich.
  Das Schließen der Suche räumt den Begriff weg; ein aktiver Filter zeigt sich
  als Zeile mit „zurücksetzen". Ein eingeklappter, still wirksamer Filter ist
  ein Fehler, kein Feature.
- **`hidden md:…` funktioniert an `Button` nicht.** `Button` bringt
  `inline-flex` als Grundklasse mit, und Tailwind gibt `.inline-flex` **nach**
  `.hidden` aus — an derselben Klassenliste gewinnt `inline-flex`. Wer einen
  Knopf erst ab `md` zeigen will, hängt `hidden md:inline-flex` an eine Hülle.
  Umgekehrt ist `md:hidden` am Knopf in Ordnung: Es steht in einer Media-Query
  und kommt damit später.

## Schwebender Knopf

**Ein Tippen führt direkt zur Standardaktion**, es gibt keine Zwischenfrage
mehr. Sie ist einstellbar — allgemein und je Bereich —, und die Regeln stehen
in `lib/domain/fab.ts`: `scopeForPath` (Pfad → Bereich), `resolveFabAction`
(Bereich schlägt allgemein, Rückfall `'expense'`) und `fabVisibleOnPath`.

- **Die Zuordnung Pfad → Bereich gehört in die Domäne**, nicht in die
  Komponente: Sie hat zwei Verbraucher, den Knopf und die Einstellungsseite.
  Und sie muss den nachgestellten Schrägstrich vertragen — `trailingSlash: true`
  liefert `/buchungen/`.
- **`fabDefault` und `fabScopes` hängen am Haushalt**, nicht am Gerät: Es ist
  eine Aussage darüber, wie dieser Haushalt erfasst, wie `askForPot`, und sie
  steht in der Sicherung. Deshalb braucht beides einen Standardwert in
  `withHouseholdDefaults` **und** im `householdSchema`.
- **Ein fehlender Schlüssel in `fabScopes` heißt „wie überall"**, nicht
  „Ausgabe". Ein eigener Wert `'inherit'` hätte denselben Effekt, aber ein
  Bereich, für den nichts eingestellt ist, folgt so auch einer späteren
  Änderung des Allgemeinen.
- **`fabScopes` braucht `z.partialRecord`.** Bei einem Enum als Schlüssel
  verlangt `z.record` in Zod 4 jeden Wert des Enums — ein Haushalt ohne
  Ausnahmen wäre damit nicht einlesbar.
- **Langes Drücken ist nur die halbe Bedienung.** `lib/ui/useLongPress.ts`
  bricht bei Bewegung ab (sonst öffnet Scrollen das Menü), unterdrückt das
  Kontextmenü nur am eigenen Knopf und merkt sich, dass es ausgelöst hat —
  sonst führte der `click` nach dem `pointerup` die Standardaktion obendrauf
  aus. Weil die Geste für Tastatur und Screenreader unerreichbar ist, öffnet
  **Pfeil nach oben** dasselbe Menü. Ohne diesen zweiten Weg wäre „Einnahme"
  mobil per Tastatur unerreichbar; er ist nicht optional.
- **Im `aria-label` steht „für mehr", nicht „für weitere".** „weitere" enthält
  „Weiter" — denselben Namen, den jeder Schritt im Erfassen-Sheet trägt, und
  eine Rollen-Abfrage findet dann zwei Knöpfe.
- **Der Topf kommt aus der Adresse.** Auf `/toepfe/detail?pot=…` liest der
  Knopf `?pot=` und gibt ihn als `defaultPotId` weiter; der Knopf „Auf „X"
  buchen" auf der Seite ist damit ab `md` übrig und mobil weg. Dafür braucht
  der Knopf `useSearchParams` und damit eine `Suspense`-Grenze **um** ihn —
  die steht in `AppShell`. Fehlt sie, scheitert der Build, nicht erst die
  Laufzeit.
- **Der Knopf trägt immer ein Plus**, auch wenn die Standardaktion „Ausgabe"
  ist. Ein Minus beschreibt den Betrag, nicht die Handlung — angelegt wird in
  beiden Fällen etwas. Welche Art es wird, steht im `aria-label`; im Menü und
  in der Abfrage tragen Ausgabe und Einnahme gegenständliche Symbole
  (Einkaufswagen, Sparschwein), weil zwei Rechenzeichen nebeneinander wie eine
  Operation aussehen und nicht wie eine Wahl.
- **In den Einstellungen und auf den Rechtsseiten erscheint der Knopf nicht.**
  Dort erfasst niemand etwas, und auf den Schaltern lag er im Weg.

## Löschen

Bis zu dieser Runde gab es **keinen** Weg, eine Buchung zu löschen:
`deleteEntry` stand im Repository und wurde von der Oberfläche nie gerufen.
Jetzt gibt es zwei, und beide braucht es.

- **Wischen ist nur die halbe Bedienung.** Dieselbe Lage wie beim langen
  Drücken am schwebenden Knopf: Für Tastatur und Screenreader ist eine Geste
  unerreichbar. Der Löschknopf im `EntrySheet` ist deshalb der zweite Weg und
  nicht optional — wer ihn entfernt, nimmt einem Teil der Nutzer das Löschen
  ganz.
- **`lib/ui/useSwipeAction.ts` gibt die Spur erst frei, wenn die waagerechte
  Bewegung die senkrechte übersteigt** und 12 px reißt. Ohne diese Prüfung
  zieht jeder Daumen beim Scrollen Zeilen auf. Dazu `touch-action: pan-y` an
  der Zeile (sonst scrollt der Browser waagerecht mit, und `preventDefault`
  kommt bei einem passiven Listener zu spät) und `setPointerCapture`, weil der
  Finger eine 44 px hohe Zeile ständig verlässt.
- **Nach einem Wischen folgt kein Klick.** `consumeTriggered()` wie bei
  `useLongPress` — sonst öffnete sich die Buchung, die gerade gelöscht wurde.
  Das gilt auch unterhalb der Auslöseschwelle: Ein abgebrochenes Wischen ist
  kein Tippen.
- **Die Rückfrage ist voreingestellt an.** Nicht aus Vorsicht, sondern weil es
  kein Rückgängig gibt: `deleteEntry` löscht zwar weich (`deletedAt`), aber
  ein `restoreEntry` existiert nicht. Wer sie abschaltet, weiß das dann — der
  Text unter dem Schalter sagt es.
- **Eine Buchung mit `purchaseId` wird nie einzeln gelöscht.** Ihr Betrag ist
  die Summe der Posten ihres Topfes, und an einer Buchung der Gruppe hängt der
  Beleg; einzeln gelöscht bliebe ein Einkauf zurück, dessen Posten ins Leere
  zeigen. Die Regel steht als `canDeleteEntryDirectly` in
  `lib/domain/ledger.ts` und wird von beiden Wegen gelesen — die Geste löst
  dann nicht aus, das Sheet zeigt statt des Knopfes den Weg zum Einkauf.
- **Die drei Schalter hängen am Gerät**, nicht am Haushalt (Einstellungen →
  Erfassen → „Löschen"). Wischen ist eine Berührungsgeste, die es am Desktop
  gar nicht gibt; eine Aussage über „diesen Haushalt" wäre sie nicht. Wer das
  Löschen für alle unterbinden will, nimmt die Rolle „Nur Lesen" — die wirkt
  im Repository.

## Sparziel-Töpfe

Vierte Topf-Art neben Monatsbudget, Budget mit Übertrag und Nur Kategorie:
sparen auf einen Betrag (`goalCents`) bis zu einer Frist (`targetDate`).
Fällt bewusst aus dem Preset-Schema der anderen drei heraus
(`lib/domain/pot-kinds.ts`), weil ein Sparziel nicht periodisch ist — es läuft
über die gesamte Lebenszeit des Topfes, nicht über einzelne Perioden wie
`limitCents`/`carryOver`. Der Fortschritt (`computeGoalState` in
`lib/domain/ledger.ts`) summiert deshalb **alle** Buchungen des Topfes, nicht
die einer Periode — anders als `computePotPeriodState`.

- **Übertrag entfällt.** `carryOver` beschreibt, was zwischen Perioden
  übernommen wird; bei einem Sparziel gibt es keine Perioden.
- **Kein Deckel.** Ein Sparziel zeigt an, es begrenzt nicht — anders als ein
  Monatsbudget lässt sich über den Zielbetrag hinaus weiter buchen.
- **Die Sperre nach Ablauf ist datumsgetrieben, nicht betragsgetrieben.**
  Wird der Zielbetrag vor der Frist erreicht, bucht der Topf normal weiter;
  erst das Verstreichen von `targetDate` sperrt (`lockDueGoalPots`, einmal
  pro Sitzung aus `AppGate.tsx` neben `materializeRecurringRules` aufgerufen —
  gleiche Fehlerbehandlung, gleicher Grund: im schlimmsten Fall sperrt ein
  fälliges Ziel erst beim nächsten Start).
- **`lockedAt` ist nicht `archivedAt`.** Zwei unabhängige Felder für zwei
  verschiedene Dinge: `archivedAt` ist der Nutzerwunsch, jederzeit per Knopf
  umkehrbar, und blendet nur in der Oberfläche aus — die Buchung selbst bleibt
  über andere Wege möglich (Bon-Import, Wiederkehrend). `lockedAt` ist eine
  echte Schreibsperre und sitzt deshalb im Repository, nicht nur in einem
  ausgeblendeten Formularfeld — `createEntries`, `updateEntry` (nur beim
  Wechsel des Topfes) und der Materialisierer für wiederkehrende Buchungen
  prüfen sie. Sie hebt sich außerdem **nicht** über denselben
  „Wieder aktivieren“-Knopf auf wie das Archivieren, sondern nur über eine
  neue, in der Zukunft liegende `targetDate` (`updatePot`) — ein bewusster
  Schritt statt eines einzelnen Knopfes, damit ein abgelaufenes Ziel nicht
  aus Versehen weiterläuft.
- **Töpfe-Auswahllisten, die `archivedAt` prüfen, prüfen jetzt auch
  `lockedAt`** (Erfassen-Sheet, Standardtopf, Bon-Import, wiederkehrende
  Regeln) — derselbe mechanische Fund-und-Ersetz wie bei jeder neuen
  Topf-Eigenschaft, die eine Buchung verhindern soll. Ausnahme bewusst: die
  Töpfe-Übersicht (Heute, Töpfe) blendet einen gesperrten Topf **nicht** aus
  — anders als ein archivierter bleibt er sichtbar, nur nicht mehr bebuchbar.
- **„Einzahlen"/„Ausgeben" statt „Ausgabe"/„Einnahme" — nur in diesem
  Kontext.** Auf einen Topf zu buchen heißt in der Anwendung immer „Ausgabe",
  und `computeGoalState` rechnet entsprechend: Ausgabe erhöht das Gesparte,
  Einnahme senkt es (eine Auszahlung im Urlaub ist technisch eine Einnahme).
  Das ist korrekt gerechnet und falsch benannt — „Ausgabe: 200 € auf Urlaub"
  klingt nach Geld, das weg ist, erhöht aber den Topf. `lib/domain/entry-kinds.ts`
  übersetzt die Wörter für einen Sparziel-Topf, ohne die Rechnung anzufassen:

  | Buchungsart | im Sparziel-Kontext |
  | ----------- | ------------------- |
  | `expense`   | „Einzahlen"         |
  | `income`    | „Ausgeben"          |

  Gilt nur dort, wo ein Sparziel-Topf feststeht (Topf-Detail, dessen
  Einstellungen, der schwebende Knopf auf `?pot=`, das Erfassen-Sheet mit
  vorbelegtem Sparziel-Topf) — die allgemeine Buchungsliste und die
  Auswertung bleiben bei „Ausgabe"/„Einnahme".

- **`goalPhase` ist reine Vorbelegung, keine zweite Rechnung.** Ein Sparziel
  hat zwei Lebensabschnitte: erst einzahlen, dann (im Urlaub) ausgeben. Der
  Schieberegler auf der Topf-Detailseite schaltet `Pot.goalPhase`
  (`'saving' | 'spending'`) um und legt darüber fest, welche Buchungsart der
  schwebende Knopf vorbelegt (`resolveGoalFabAction` in `lib/domain/fab.ts`,
  Topf schlägt Bereich schlägt allgemein) und welches Wort erscheint — an
  `computeGoalState` ändert sie nichts. Wie `lockedAt` kein zweites
  `archivedAt` ist, ist `goalPhase` kein zweites `kind`: Sie beschreibt einen
  Zustand _innerhalb_ der Art „goal", nicht die Art selbst, und ist deshalb
  `.nullable().default(null)` im Schema wie jedes andere Sparziel-Feld.
- **Eine Auszahlung zählt in `computeHouseholdSummary`/`periodTotals` nicht
  als Einnahme.** Das Geld steckte schon in den Ausgaben, als es angespart
  wurde — ein zweites Mal als Zufluss zu zählen wäre falsch, auch wenn
  `Entry.kind` technisch `'income'` ist. Die Ausnahme gilt **nur** für diese
  beiden Kennzahlen der Auswertung; `summarizeByTag` in `lib/domain/tags.ts`
  bleibt bewusst unberührt — es ist eine Aufschlüsselung je Buchung wie bei
  jedem anderen Topf, und die schon bestehende Regel, dass sich Tag-Summen
  nicht zur Gesamtsumme addieren, deckt diesen Fall mit ab.

## Klebende Leiste über Listen

`components/lists/ListToolbar.tsx` trägt Überschrift, Suche, Filter, freie
Links und eine Aktion — und bleibt beim Scrollen oben. Der Grund ist nicht
Optik: Vorher verschwand mit der Überschrift auch die Lupe, und in einer
langen Liste zu suchen hieß erst hochscrollen.

Vier Dinge, die beim Anfassen zählen:

- **`top` ist `env(safe-area-inset-top)`, nicht 0** — sonst klebt die Leiste
  als installierte App unter der Statusleiste.
- **Die Leiste meldet ihre Höhe als `--list-toolbar-h`** (am Wurzelelement, per
  `ResizeObserver`, beim Ausbauen aufgeräumt). Der Datumskopf in `EntryList`
  klebt selbst und rechnet damit; ohne diesen Versatz liegt er hinter der
  Leiste. Ein fester Wert geht nicht, weil die Höhe mit aufgeklappter Suche
  wächst.
- **Stapelreihenfolge**: untere Leiste und schwebender Knopf `z-40`, `Sheet`
  `z-50`, diese Leiste `z-30`, der Datumskopf `z-10`.
- **`-mx-4 px-4 md:-mx-8 md:px-8`**, sonst scrollt Inhalt sichtbar an ihren
  Rändern vorbei.

Die Höhen der **festen** Klebezeilen stehen als Tokens in `app/globals.css`
(`--month-head-h`, `--legal-bar-h`, `--nav-bar-h`) — nur die Werkzeugleiste
meldet ihre Höhe zur Laufzeit, weil sie mit aufgeklappter Suche wächst.
`--nav-bar-h` ist die untere Leiste **plus** dem Abstand, den auch der
schwebende Knopf einhält; wer den Knopf verschiebt, zieht den Wert mit.

Im Einsatz auf Heute, Buchungen, Wiederkehrend, Töpfe, Topf-Detail,
Auswertung (nur Titel) und über `SettingsPage` auf allen
Einstellungs-Unterseiten. Das Filtern der Buchungsliste steckt in
`components/lists/useEntryFilters.ts`, die Felder in `EntryFilterFields` —
getrennt, weil ein Haken, der JSX zurückgibt, beim Lesen überrascht.

## Geräte-Einstellungen

Darstellung (hell/dunkel/automatisch) und Art der Betragseingabe liegen im
`localStorage`, nicht am Haushalt-Datensatz — `lib/prefs/device-prefs.ts`. Zwei
Gründe, beide tragend:

1. Das Thema muss **vor dem ersten Rendern** stehen. Der Snapshot lädt
   asynchron unterhalb von `AppGate`; aus IndexedDB gelesen blitzte bei jedem
   Start das helle Thema auf. Dafür gibt es das Inline-Skript in
   `app/layout.tsx` (`THEME_BOOTSTRAP_SCRIPT`).
2. Es sind Vorlieben _dieses Geräts_. In der Sicherung und im späteren Sync
   haben sie nichts zu suchen, sonst stellt ein Import vom Telefon den
   Dunkelmodus am Desktop um.

Wer eine Einstellung ergänzt, die den Haushalt betrifft (Währung, Periode),
nimmt weiter `updateHousehold` — und trägt das Feld in `householdSchema` nach,
sonst scheitert der Import.

Eine neue Gerätevorliebe braucht vier Zeilen: Typ und Schlüssel in
`device-prefs.ts`, den Schlüssel in `ALL_KEYS` (sonst merkt ein zweiter Tab
nichts davon), einen Haken in `useDevicePref.ts` und — wenn sie vor dem ersten
Malen sichtbar ist — einen Eintrag im Bootstrap-Skript.

## Darstellung und Themes

Fünf Themes (`classic`, `pastel`, `nerd`, `contrast`, `cyberpunk`), jedes hell
und dunkel, dazu ein Schalter für echtes Schwarz und ein Vorrat an
Akzentfarben. Die Werte stehen in `app/themes.css`, die Liste für die
Oberfläche in `lib/ui/themes.ts`.

**Der Modus wird in JavaScript aufgelöst, nicht in CSS.** Am Wurzelelement
stehen vier Attribute: `data-mode` (`light`/`dark`, aufgelöst), `data-theme`,
`data-accent` und `data-amoled`. Vorher hing alles an `data-theme` und am
_Fehlen_ des Attributs, und jeder Dunkelwert stand doppelt — einmal im
`@media (prefers-color-scheme: dark)` für „Automatisch“, einmal unter
`[data-theme='dark']` für die ausdrückliche Wahl. Bei fünf Themes wären das
zehn doppelte Blöcke. Übrig bleibt **ein** `@media`-Block in `globals.css` für
den Fall, dass JavaScript nicht läuft.

Daraus folgt:

- **Das Bootstrap-Skript setzt alle vier Attribute**, nicht mehr nur eines,
  und prüft die gelesenen Werte gegen die erlaubten. Es erzeugt seine Tabellen
  aus `lib/ui/themes.ts` — eine neue Palette ist damit an genau zwei Stellen
  nachzutragen (CSS und Liste), nicht an dreien.
- **Die Akzent-Prüfung läuft im Skript je Theme**, genau wie `resolveAccent`.
  Zwei verschiedene Regeln wären ein Farbwechsel beim Hydrieren.
- **Die Vorschaukacheln tragen die Attribute selbst.** Die Selektoren hängen
  nicht am Wurzelelement, also gilt innerhalb einer Kachel deren Palette. Die
  Vorschau ist die Palette, keine nachgebaute Behauptung.

**„Geprüft auf Lesbarkeit“ ist ein Test, keine Zusage.**
`lib/ui/themes.test.ts` liest `app/themes.css`, baut die Kaskade nach und
rechnet für **jede** Kombination aus Theme, Modus, Akzent und AMOLED die
Kontrastverhältnisse: Text 7:1, gedämpfter Text und Akzent 4,5:1, Topffarben
3:1, dazu die Prüfung, ob eine Farbe außerhalb von sRGB liegt. Die Mathematik
steht in `lib/ui/contrast.ts`. Wer einen Farbwert nachjustiert, bekommt vom
Test gesagt, ob er noch lesbar ist — deshalb darf in `themes.css` **kein**
`var()` und keine Verschachtelung stehen, sonst läuft der Nachbau der Kaskade
daran vorbei.

`--pot-*` darf ein Theme mitüberschreiben; „Hoher Kontrast“ und „Cyberpunk“ tun
es. Die sechs gedeckten Topffarben wären dort nicht unterscheidbar.

## Symbole

Bediensymbole kommen aus `lucide-react` und laufen über `lib/ui/Icon.tsx` —
dort wird die eingestellte Strichstärke gesetzt und `aria-hidden` vergeben. Der
Name steht am Knopf, nicht am Symbol.

**Einzeln importieren** (`import { Search } from 'lucide-react'`): Der
Sammelimport zieht rund 1500 Module in den Entwicklungs-Build.

Emoji bleiben, wo der Nutzer sie wählt: `POT_ICONS` in `lib/ui/colors.ts`. Ein
Icon-Satz kann „🥑“ nicht abbilden.

## Einstellungen

Eine Übersicht mit acht Unterseiten (`app/einstellungen/*`), nicht mehr eine
Seite mit zwölf Karten. Kopfzeile und Titel jeder Unterseite kommen aus
`SettingsPage` und damit aus `ListToolbar` — dieselbe klebende Leiste wie über
den Listen, und auf „Ordnen" trägt sie die Suche über Tags und Zuordnungen. `isActive` in `AppShell` arbeitet mit `startsWith`,
also bleibt „Einstellungen“ markiert und die untere Leiste behält ihre vier
Einträge. Jede neue Unterseite gehört in `APP_SHELL` in `public/sw.js`, sonst
ist sie offline nicht erreichbar.

**Die Einstellungen eines Topfes hängen am Zahnrad in seiner Leiste**, nicht
in einer Karte unter der Buchungsliste. Vorher musste man an allen Buchungen
des Topfes vorbeiscrollen, um ein Limit zu ändern. Im selben Sheet stehen die
**wiederkehrenden Regeln dieses Topfes** — „Miete" gehört zu „Wohnen" — mit
dem Topf vorbelegt; nach dem zu fragen, den man gerade offen hat, wäre eine
Frage ohne Antwortmöglichkeit.

**`/buchungen/wiederkehrend` bleibt und steht in den Einstellungen.** Das
Symbol über der Buchungsliste ist weg (eine Regel legt man einmal an und sieht
sie jahrelang nicht wieder), aber die Seite selbst ist der **einzige** Ort, an
dem Regeln **ohne** Topf verwaltbar sind — Gehalt läuft auf den Haushalt.
Fiele sie weg, liefen solche Regeln still weiter und wären nicht mehr
erreichbar.

**Die Gefahrenzone ist kein Stilmittel.** Dort steht, was sich nicht rückgängig
machen lässt: `wipeAll` und das ersetzende Einlesen einer Sicherung. Letzteres
lag vorher als danger-Knopf direkt neben „Zusammenführen“ — ein Fehlgriff dort
verwarf den ganzen Haushalt. Beide Wege teilen sich `useBackupImport`, das
Dateifeld steckt in `BackupFilePicker` (eine Referenz im Rückgabewert eines
Hooks liest sonst jede Karte beim Rendern, und `react-hooks/refs` hält das zu
Recht an).

Nicht in die Gefahrenzone gehören umkehrbare Dinge: Topf archivieren, Tag
umbenennen, `resetLocalDeviceRole`. Einen Topf zu löschen bleibt auf seiner
Detailseite, wo der Kontext steht.

## Overlays

Jedes Overlay nimmt `useScrollLock` aus `lib/ui/useScrollLock.ts` — `Sheet`
tut das für alle Sheets, `ReceiptViewer` ist das einzige handgebaute.

`body { overflow: hidden }` allein genügt **nicht**: `app/globals.css` setzt
`html { overflow-x: hidden }`, und ist eine Achse `hidden`, rechnet CSS die
andere von `visible` auf `auto`. Damit ist `html` der Scrollcontainer, und das
`overflow` des Body wird nicht mehr auf den Viewport übertragen. Der Haken
sperrt beides und hält die Position über `position: fixed; top: -y` fest — das
ist zugleich der Weg, der auf iOS Safari hält. Er zählt mit, weil
`QuickEntryButton` zwei Sheets in einem Commit übergibt.

Was Overlays weiter **nicht** haben: Fokusfalle, `inert`, Fokus-Rückgabe beim
Schließen. Offen und bekannt, kein Versehen.

## Textlängen

`TEXT_LIMITS` in `lib/domain/schemas.ts` ist die einzige Quelle: Schema,
`maxLength` am Eingabefeld und `clampText` auf dem Schreibweg im Adapter.

Der Grund steht dort im Kommentar und ist teuer bezahlt: Vorher stand das Limit
nur im Schema, und weil das Schema ausschließlich beim Import läuft, ließ sich
eine zu lange Notiz speichern, exportieren — und dann nicht mehr einlesen. Die
Sicherung war unbrauchbar. Neu ist außerdem `clampBackupText`
(`lib/domain/backup.ts`): Der Import kürzt und meldet, statt die ganze Datei
abzulehnen. Das Schema selbst bleibt streng, es ist die künftige API-Grenze.

## Firma und Anschrift

Eine Buchung trägt zwei Ortsangaben, und die Trennung ist jung:

- **`merchant` ist der Name** und heißt in der Oberfläche „Firma". Es hieß
  dort früher „Wo?" und trug beides — damit ließ sich weder eine Karte öffnen
  noch eine Filiale von einer anderen unterscheiden.
- **`address` ist die vollständige Anschrift** und heißt jetzt „Wo?".

**Die Richtung war die Entscheidung.** `merchant` zur Anschrift zu machen
hätte in jeder bestehenden Buchung einen Namen als Anschrift geführt — und
der Bon-Import schreibt dort seit jeher den Händlernamen. So bleibt der
Bestand richtig, und das neue Feld startet leer.

- **Angezeigt wird gekürzt, gespeichert vollständig.** `shortenAddress` in
  `lib/domain/address.ts` nimmt den Teil vor dem ersten Komma; der volle Text
  steht im `title`.
- **Das Kartenziel ist `geo:`, keine Adresse im Netz.** Ein
  `https://…maps…`-Link schickte die Anschrift an einen Dritten, und
  `app/datenschutz/page.tsx` sagt belegbar zu, dass nichts das Gerät
  verlässt. Der Preis steht dort ebenso ehrlich: Am Desktop tut ein
  `geo:`-Verweis je nach System nichts.
- **Der Verweis steht unter der Zeile, nicht in ihr.** Die Listenzeile ist
  eine Schaltfläche, und ein Verweis darin ist kein gültiges HTML — der
  Browser zieht ihn heraus und die Zeile zerfällt. Die eigene Zeile kostet
  Höhe, aber nur bei Buchungen mit Anschrift.
- Gesucht wird über beide Felder, im Snapshot und im Adapter. `address` ist
  **nicht indiziert** (wie `tags`), also keine Dexie-Migration — aber ein
  Standardwert im `entrySchema`, sonst lässt sich keine ältere Sicherung mehr
  einlesen.

## Bon-Import

- **Ein Einkauf, mehrere Buchungen.** Ein Bon auf drei Töpfe wird zu drei
  Buchungen mit gemeinsamer `splitGroupId` — anders stimmt die Auswertung
  nicht. Der Beleg hängt an der ersten Buchung der Gruppe; `EntryList` zeigt
  ihn für die ganze Gruppe.
- **Gelernte Zuordnungen** (`itemRules`, Dexie `version(2)`) gehören zum
  Haushalt und stehen in der Sicherung. Gelernt wird nur, was von Hand gesetzt
  wurde — einen Vorschlag zu bestätigen ist keine neue Information. Löschbar
  über Einstellungen → „Zuordnungen"; ohne diese Liste wäre eine falsch
  gelernte Regel nicht mehr loszuwerden.
- **pdf.js liegt nicht im Startbundle.** `await import(…)` erst beim ersten
  Einlesen. Der Worker steht als Datei mit Version im Namen unter
  `public/vendor/` — nicht als CDN-Adresse, weil die Datenschutzerklärung
  zusagt, dass alle Dateien vom selben Server kommen. Bei einem Update von
  `pdfjs-dist`: Datei neu kopieren (**aus `legacy/`**, Befehl steht in
  `lib/pdf/extract.ts`) und `PDFJS_VERSION` nachziehen.
- **Es ist der Legacy-Build, und das ist keine Bequemlichkeit.** Das
  Standard-Bundle von pdf.js 6 ruft `Map.prototype.getOrInsertComputed`. Fehlt
  die Methode im Browser, wirft der XRef-Cache, pdf.js fällt auf „Indexing all
  PDF objects" zurück — und ein echter Bon kommt als Unsinn oder gar nicht
  zurück. Die handgebauten Muster überlebten diesen Rückfall, der Beleg einer
  Supermarktkette nicht. Deshalb nehmen Browser **und** Unit-Test denselben Build über
  `defaultLoader`; lief der Test gegen `legacy/` und der Browser gegen das
  Standard-Bundle, saß der Fehler in der Lücke und kein Test konnte ihn sehen.
  Aus demselben Grund achtet `e2e/bon-import.spec.ts` auf Konsolenfehler: Der
  Rückfall war still.
- **Die Textschicht wird über `getReader()` gelesen, nicht über
  `page.getTextContent()`.** Letzteres tut intern
  `for await (const value of stream)`, und **Safari hat
  `ReadableStream[Symbol.asyncIterator]` nicht** — nur Chromium und Firefox.
  Auf dem iPhone kam deshalb „undefined is not a function", erst nach dem Laden
  des Dokuments, und für den Nutzer sah es aus wie ein unlesbares PDF. Der Test
  nimmt dem Browser genau diese Methode weg („Safari"-Fall in
  `e2e/bon-import.spec.ts`); ein WebKit im Testlauf wäre eine zweite
  Browser-Abhängigkeit für eine Zeile. Wer hier neue pdf.js-Aufrufe ergänzt,
  prüft sie auf `for await` über einen Stream — im Worker ist eine solche
  Schleife abgesichert, im Hauptthread nicht.
- **Posten stehen vor der Summe.** Was nach der Summenzeile kommt, ist
  Fußzeile und wird nicht gelesen. Klingt nach einer Feinheit, ist aber der
  Unterschied zwischen funktionierend und nutzlos: Ein echter Bon trug dort
  22,24 € an Bonus-Guthaben und Coupons, die als Posten mitgezählt wurden — die
  Summenprobe riss, und die Aufteilung fiel ganz aus.
- **Die Kopfzeile ist nicht die erste Zeile.** Ein Bon kann über dem Namen
  Werbung drucken („Du hast 27 Treuepunkte gesammelt."), und `findMerchant`
  nahm genau die. Dafür gibt es `HEADER_CHATTER` — getrennt von
  `NON_ITEM_PATTERNS`, weil solche Zeilen durchaus einen Betrag tragen dürfen
  („Sie sparen 2,40 €") und trotzdem kein Händler sind. Steht die Anschrift in
  derselben Zeile, schneidet `stripAddress` sie ab — aber nur, wenn hinter dem
  Trenner eine Ziffer steht, sonst verliert „Müller - Bio und Frische" seine
  Hälfte.
- **Die Menge steht vor _oder_ hinter der Bezeichnung.** `2x 1,55 Apfelsaft`
  und `Apfelsaft 2 * 1,55` sind beide echt; für die zweite Form gibt es
  `TRAILING_QUANTITY`. Ohne sie klebte die Rechenaufgabe im Namen
  („Schokolinsen 2 * 0,95") und `quantity` blieb trotzdem leer.
- **Muster statt echter Bons im Test.** `e2e/fixtures/*.pdf` sind von Hand
  gebaut (`build.mjs`): mit `ekabs.json`, ohne, einer mit dem Aufbau eines
  Supermarkt-Ausdrucks samt gesperrtem Kopf, Rabatt-, Mengen- und
  Bonuszeilen, und einer mit Werbekopf und der Menge hinter der Bezeichnung. Ein echter Bon gehört ins Muster nur als **Struktur**, nie als
  Datei: Da stehen Einkauf, Filiale und Signatur drin, und das Repository ist
  öffentlich.

## Handelsketten im Repository

**Kein Name einer Handelskette in Code, Tests, Doku oder Commit-Nachricht** —
auch nicht als Abkürzung, die sich daraus ableitet. Der Name steht auf dem Bon,
wandert von dort in die lokale Datenbank und auf den Bildschirm; er ist
**Daten, nicht Code**.

Daraus folgt der Bau der Profile in `lib/domain/receipt/`:

- **Eine Profildatei trägt einen Tiernamen**, und die Kennung im Profil ist
  daraus abgeleitet (`chains/luchs/` → `id: 'lux'`). Welche Kette gemeint ist,
  steht nirgends im Repository.
- **Erkannt wird am Fingerabdruck des Layouts**, nie an einem Namen: eine
  Werbezeile, ein Spaltenkopf, die Schreibweise der Fußzeile. `matchProfile`
  verlangt `minHits` Treffer; darunter gilt kein Profil. Ein Fingerabdruck, der
  zu viel trifft, belegt fremde Bons mit fremden Zuordnungen vor — und das
  fällt erst beim Auswerten auf.
- **Ein Profil verbessert nur, es ist nie Voraussetzung.** Trifft keines, kommt
  genau das Ergebnis heraus, das der gemeinsame Parser liefert.
- **Vorrang:** gelernte `itemRules` des Haushalts → Profil-Tabelle → nichts.
  Eine Tabelle im Code darf eine Entscheidung des Nutzers nicht überstimmen.
- **Profil-Vorschläge werden nicht gelernt.** `manuell` bleibt für sie `false`;
  sonst stände die Liste unter „Ordnen" nach einem Einkauf voller Einträge, die
  niemand angelegt hat.
- **`produkte.ts` ist eine reine Tabelle** und liegt getrennt vom Profil: Wer
  eine Zuordnung ändert, soll nicht durch Erkennungsmuster scrollen müssen. Die
  `keyword` müssen normalisiert sein (wie `normalizeKeyword` sie erzeugt),
  sonst treffen sie nie — und ein fehlender Vorschlag ist kein Fehler, den
  jemand bemerkt.
- **`kategorie` ist ein Schlüssel, keine Topf-ID.** Töpfe gehören dem Haushalt
  und haben zufällige IDs. `lib/domain/pot-categories.ts` hält die Schlüssel
  samt Namen — dieselben, unter denen die Ersteinrichtung ihre Töpfe anlegt —
  und `resolveCategoryPot` sucht den Topf darüber. Kein Topf, kein Vorschlag;
  geraten wird nicht.

Ein echter Bon gehört weiter nur als **Struktur** ins Muster, nie als Datei:
Da stehen Filiale, Kartennummer und Signatur drin, und das Repository ist
öffentlich.

## Bon-Posten

Die Artikelzeilen eines eingelesenen Bons bleiben liegen: `purchases` und
`purchaseItems` (Dexie `version(3)`, rein additiv), dazu `Entry.purchaseId`.
Vorher wurde aus 18 Zeilen je Topf **eine** Buchung, und von einem Posten
überlebte nur sein Name — verkettet in `note` und nicht wieder auftrennbar,
weil ein Artikelname selbst Kommas enthalten darf.

- **Die Rechnung steht in `lib/domain/purchase.ts`, nicht in der Seite.**
  `planPurchaseEntries` liefert einen Plan (`create`/`update`/`remove`), das
  Repository führt ihn in **einer** Transaktion aus. Gruppiert wird über
  `groupItemsByPot` aus `receipt-parse.ts` — dieselbe Funktion wie in der
  Vorschau des Imports; eine zweite Gruppierung wäre eine zweite Wahrheit.
- **Eine bestehende Buchung wird weiterbenutzt, nicht ersetzt.** Zuordnung
  über den Topf. Eine neue Buchung hätte eine neue ID, und alles, was daran
  hängt — Beleg, `revision` für den Sync —, wäre weg.
- **Der Beleg ist die Falle.** Er hängt an einer Buchung (`Receipt.entryId`),
  und `deleteEntry` löscht die Belege seiner Buchung mit. Wandert der letzte
  Posten aus genau dieser Buchung, wäre der Bon weg. Deshalb nennt der Plan
  `receiptAnchorId`, und das Repository hängt den Beleg um, **bevor** es
  löscht. Dafür gibt es je einen Test in der Domäne und im Adapter.
- **Änderbar sind nur Topf und Tags**, nicht Betrag und Bezeichnung: Die
  stehen so auf dem Beleg, und die Summenprobe (`quality`) soll eine Aussage
  über den Bon bleiben statt über eine nachbearbeitete Liste. Aus demselben
  Grund ist der Betrag einer Buchung mit `purchaseId` im `EntrySheet`
  gesperrt — ein Wert, den die nächste Postenänderung still überschreibt,
  wäre ein unsichtbarer Fehler.
- **Tags des Einkaufs stehen am `Purchase`**, nicht nur an den Buchungen:
  Die Buchungen werden neu gerechnet, und was nur an ihnen hinge, wäre nach
  dem ersten Umhängen weg, ohne dass jemand es gelöscht hätte.
- **Ein Bon ohne verwertbare Posten (`quality: 'unsicher'`) wird kein
  Einkauf**, sondern wie bisher eine einzelne Buchung über die Endsumme. Ein
  Einkauf ohne Posten wäre eine leere Hülle.
- **Alte Bons bekommen keine Posten nachträglich.** Aus der verketteten Notiz
  ließen sie sich nicht zurückgewinnen — genau das war der Mangel.
- Die Einkaufsansicht liegt unter `/buchungen/einkauf?einkauf=<id>`
  (Query-Parameter wegen `output: 'export'`, wie `app/toepfe/detail`) und
  gehört in `APP_SHELL` in `public/sw.js`.

## Rechtsseiten

`/impressum` und `/datenschutz` müssen **ohne** eingerichteten Haushalt
erreichbar bleiben; `components/AppGate.tsx` lässt sie über `PUBLIC_ROUTES`
durch. Beide Seiten enthalten Platzhalter und einen sichtbaren Warnhinweis —
der Hinweis verschwindet erst, wenn echte Angaben eingetragen sind.

Ändert sich, wie die App mit Daten umgeht (zentrale DB, Anmeldung, externe
Dienste), ist `app/datenschutz/page.tsx` mitzuändern. Der Text behauptet heute
belegbar, dass nichts das Gerät verlässt — und nennt seit den Bon-Posten
ausdrücklich, dass Artikelzeilen dauerhaft gespeichert werden und nicht nur
zu Summen verrechnet.
