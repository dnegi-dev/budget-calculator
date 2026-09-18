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
- **Erfassen läuft über den schwebenden Knopf** (`QuickEntryButton`), der die
  Art vorab abfragt und `EntrySheet` mit `lockKind` öffnet. Seiten-Knöpfe zum
  Erfassen gibt es nur noch ab `md`. In den Einstellungen erscheint der Knopf
  nicht: Dort erfasst niemand etwas, und er lag auf den Schaltern. Wer den
  Knopf verschiebt, prüft das `pb-36` am `main` in `AppShell` mit — er endet
  8,25 rem über dem unteren Rand, und darunter darf keine Listenzeile liegen
  bleiben.
- **Suche und Filter auf der Buchungsseite liegen hinter je einem Symbol.** Das
  Schließen der Suche räumt den Begriff weg; ein aktiver Filter zeigt sich als
  Zeile mit „zurücksetzen". Ein eingeklappter, still wirksamer Filter ist ein
  Fehler, kein Feature.
- **`hidden md:…` funktioniert an `Button` nicht.** `Button` bringt
  `inline-flex` als Grundklasse mit, und Tailwind gibt `.inline-flex` **nach**
  `.hidden` aus — an derselben Klassenliste gewinnt `inline-flex`. Wer einen
  Knopf erst ab `md` zeigen will, hängt `hidden md:inline-flex` an eine Hülle.
  Umgekehrt ist `md:hidden` am Knopf in Ordnung: Es steht in einer Media-Query
  und kommt damit später.

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

`app/globals.css` wertet `[data-theme='light'|'dark']` aus; `theme-color` kommt
aus dem `viewport`-Export und hängt an `prefers-color-scheme`, muss bei
ausdrücklicher Wahl also zur Laufzeit nachgezogen werden (`applyTheme`).

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
  zurück. Die handgebauten Muster überlebten diesen Rückfall, ein REWE-Beleg
  nicht. Deshalb nehmen Browser **und** Unit-Test denselben Build über
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
- **Muster statt echter Bons im Test.** `e2e/fixtures/*.pdf` sind von Hand
  gebaut (`build.mjs`): mit `ekabs.json`, ohne, und einer mit dem Aufbau eines
  Supermarkt-Ausdrucks samt gesperrtem Kopf, Rabatt-, Mengen- und
  Bonuszeilen. Ein echter Bon gehört ins Muster nur als **Struktur**, nie als
  Datei: Da stehen Einkauf, Filiale und Signatur drin, und das Repository ist
  öffentlich.

## Rechtsseiten

`/impressum` und `/datenschutz` müssen **ohne** eingerichteten Haushalt
erreichbar bleiben; `components/AppGate.tsx` lässt sie über `PUBLIC_ROUTES`
durch. Beide Seiten enthalten Platzhalter und einen sichtbaren Warnhinweis —
der Hinweis verschwindet erst, wenn echte Angaben eingetragen sind.

Ändert sich, wie die App mit Daten umgeht (zentrale DB, Anmeldung, externe
Dienste), ist `app/datenschutz/page.tsx` mitzuändern. Der Text behauptet heute
belegbar, dass nichts das Gerät verlässt.
