# Haushalt

Haushaltsplanung mit „Töpfen": Ausgaben werden auf Bereiche wie Lebensmittel
oder Sport gebucht, und die App sagt, wie viel dort noch übrig ist.

**Version 1 speichert ausschließlich auf dem Gerät.** Kein Konto, kein Server,
keine Übertragung. Zentrale Datenhaltung und Anmeldung über SSO sind
vorbereitet, aber nicht eingeschaltet — siehe [docs/roadmap-server.md](docs/roadmap-server.md).

## Loslegen

```bash
npm install
npm run dev          # http://localhost:3000
```

Vor der App steht eine Anmeldung: **`admin` / `admin`**, änderbar über
`NEXT_PUBLIC_APP_USER` und `NEXT_PUBLIC_APP_PASSWORD`.

> Diese Anmeldung hält Gelegenheitsbesucher ab. Sie ist **kein
> Zugriffsschutz**: Die Seite wird als statisches Bundle öffentlich
> ausgeliefert, und die Zugangsdaten stehen im ausgelieferten JavaScript.
> Für die Daten spielt das keine Rolle — die liegen ausschließlich im Browser
> des jeweiligen Besuchers. Wer echten Schutz braucht, braucht eine
> serverseitige Abfrage und damit ein anderes Hosting (siehe `STATE.md`).

Danach führt ein Wizard durch die Einrichtung: Haushaltsname, Währung,
Periodenstart, Töpfe, optional ein regelmäßiges Einkommen.

| Befehl              | Zweck                                  |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Entwicklungsserver                     |
| `npm run build`     | statisches Bundle nach `out/`          |
| `npm run serve`     | `out/` lokal ausliefern                |
| `npm run typecheck` | TypeScript ohne Emit                   |
| `npm run lint`      | ESLint                                 |
| `npm test`          | Vitest (Domänenlogik und Datenschicht) |
| `npm run test:e2e`  | Playwright-Smoke-Test                  |
| `npm run format`    | Prettier                               |

`npm run build` erzeugt ein rein statisches Bundle — es lässt sich von jedem
Webserver und aus jedem Objektspeicher ausliefern.

## Veröffentlichen

Die App läuft auf GitHub Pages unter
`https://dnegi-dev.github.io/budget-calculator/`. Jeder Push auf `main` baut
und veröffentlicht sie über `.github/workflows/deploy.yml`; vorher laufen
typecheck, lint und die Tests, damit ein kaputter Stand gar nicht erst
hochgeht.

**Einmalig nötig:** Settings → Pages → Source auf **GitHub Actions** stellen.

Pages liefert ein Projekt-Repo unter einem Unterpfad aus. Der wird über
`NEXT_PUBLIC_BASE_PATH` gesetzt (im Workflow auf `/budget-calculator`) und
laut Next-Doku **zur Bauzeit** in die Bundles eingebacken. Lokal bleibt die
Variable leer, sodass Entwicklung und Tests unter `/` laufen. Bei eigener
Domain wird sie im Workflow auf `""` gesetzt.

Den Unterpfad-Build lokal nachstellen:

```bash
NEXT_PUBLIC_BASE_PATH=/budget-calculator npm run build
npx serve out -l 3100    # http://127.0.0.1:3100/budget-calculator/
```

Drei Dinge bekommen den Präfix nicht von allein und sind deshalb eigens
gelöst: Metadata-URLs und die Service-Worker-Registrierung über
`lib/base-path.ts`, `public/manifest.webmanifest` über relative URLs, und
`public/sw.js` leitet ihn aus der eigenen Adresse ab.

## Funktionsumfang

- **Töpfe** in drei Arten, pro Topf wählbar:
  - _Monatsbudget_ — fester Betrag pro Periode, Reste verfallen.
  - _Budget mit Übertrag_ — Restbeträge und Überziehungen wandern in die nächste Periode.
  - _Nur Kategorie_ — kein Limit, zeigt nur die tatsächlichen Ausgaben.

  Die Art ist ein Preset über zwei Schaltern (`limitCents`, `carryOver`); im
  Topf-Detail lassen sich abweichende Kombinationen einstellen.

- **Buchungen** als Ausgabe oder Einnahme, mit Datum, Ort und Notiz. Erfassung
  in drei Schritten, ab dem ersten speicherbar.
- **Kassenzettel** als Nachweis zu einer Buchung — „Foto aufnehmen" öffnet die
  Kamera, „Datei wählen" die normale Auswahl des Geräts (Bild oder PDF, auch
  aus der Galerie). Bewusst ohne Auslesen: der Beleg belegt eine Änderung im
  Topf, mehr nicht.
- **Wiederkehrende Buchungen** (wöchentlich, monatlich, jährlich, mit
  Intervall) für Miete, Abos, Gehalt, unter `/buchungen/wiederkehrend`.
  Buchungen entstehen beim Öffnen der App, idempotent.
- **Auswertung**: Einnahmen, Ausgaben, Saldo sowie Verlauf, Ausgaben pro Topf
  und Anteile.
- **Export/Import**: JSON als vollständige Sicherung (optional mit Belegen),
  CSV für Tabellenprogramme.
- **Rollen** Admin / Nutzer / Nur Lesen — wirksam, nicht dekorativ.
- **Darstellung** hell, dunkel oder automatisch, und zwei Arten der
  Betragseingabe. Beides in den Einstellungen unter „Dieses Gerät": Die Wahl
  liegt im `localStorage` dieses Browsers und steht nicht in der Sicherung.
  Voreingestellt ist der Kassenzettel-Modus — nur Ziffern tippen, die letzten
  zwei sind Cent: Aus `1250` wird `12,50`, aus `12` wird `0,12`. Wer lieber
  selbst ein Komma setzt, schaltet auf „Freitext".
- **Update-Hinweis**: Ist eine neuere Fassung veröffentlicht, während die App
  offen ist, erscheint eine Leiste mit „Neu laden". Automatisch neu geladen
  wird nicht — das würde eine halb getippte Buchung verwerfen.
- **Impressum und Datenschutz** unter `/impressum` und `/datenschutz`, auch vor
  der Ersteinrichtung erreichbar. Beide sind Gerüste mit Platzhaltern und
  zeigen einen sichtbaren Warnhinweis, solange sie nicht ausgefüllt sind.

### Bedienung auf beiden Plattformen

Mobil gibt es keine Kopfzeile: Die untere Leiste trägt Heute, Buchungen,
Auswertung und Einstellungen, das Erfassen läuft über den schwebenden Knopf,
der vorab nach Ausgabe oder Einnahme fragt. Töpfe werden über die Zeile „Neuer
Topf" auf der Startseite angelegt und über den Link in den Einstellungen
verwaltet.

Auf der Buchungsseite liegen Suche und Filter mobil hinter je einem Symbol
(Lupe und Zahnrad); das Schließen der Suche räumt den Begriff weg, damit kein
unsichtbarer Filter weiterwirkt.

Ab Tablet-Breite gibt es eine Seitenleiste mit allen fünf Zielen, die Knöpfe
zum Erfassen stehen auf den Seiten, Suche und Filter stehen aufgeklappt in
einer Karte, und die Auswertung wird mehrspaltig. Die Routen und der
Funktionsumfang sind identisch — nur die Anordnung unterscheidet sich.

## Daten und Sicherung

Alles liegt in IndexedDB (`haushaltsplanung`), Belege als Blob in derselben
Datenbank. Daraus folgt:

- **Der Browser-Speicher ist die einzige Kopie.** Wer Website-Daten löscht,
  löscht den Haushalt. Der JSON-Export in den Einstellungen ist die Sicherung.
- Im privaten Modus kann der Browser IndexedDB verweigern; die App zeigt dann
  einen Hinweis statt einer leeren Oberfläche.
- Belege werden nicht verkleinert (sie sind der Nachweis), aber für Listen wird
  ein kleines Vorschaubild mitgespeichert.

## Architektur

```
app/              Routen (App Router), alle clientseitig
components/       fachliche Komponenten
lib/domain/       reine Logik: Geld, Perioden, Topf-Arten, Restbeträge, Termine
lib/data/         BudgetRepository + Dexie-Adapter + HTTP-Adapter (Stub)
lib/auth/         Session-Abstraktion (v1: lokaler Gerätenutzer)
lib/rbac/         Rechtematrix und Prüfung
lib/ui/           Primitive: Sheet, Button, AmountInput, Progress …
```

Drei Regeln halten das zusammen:

1. **`lib/domain` kennt weder React noch Storage.** Deshalb ist die
   Rechenlogik vollständig testbar, und deshalb liegen die Tests dort.
2. **Kein UI-Code greift auf Dexie zu.** Alles läuft über
   `useSnapshot()`/`useRepository()`. Eine ESLint-Regel erzwingt das.
3. **Rechte werden im Repository geprüft, nicht in der Oberfläche.** Das
   Ausblenden von Knöpfen ist Bequemlichkeit; `assertCan()` im Adapter ist die
   Regel — und genau die wandert später in den Server.

Beträge sind durchgehend Integer-Cent. Jeder Datensatz trägt `id` (clientseitig
erzeugt), `revision`, `updatedAt` und `deletedAt`, und jede Mutation schreibt
eine Zeile in die Outbox-Tabelle `changeLog`. In v1 liest diese Tabelle
niemand; ohne sie wäre eine nachträgliche Synchronisation nicht möglich.

## Konfiguration

`.env.example` beschreibt alle Variablen. Für v1 ist keine nötig; die
interessanten sind:

| Variable                    | Bedeutung                                         |
| --------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_DATA_MODE`     | `local` (Standard) oder `remote`                  |
| `NEXT_PUBLIC_CHANGE_LOG`    | `on` (Standard) oder `off`                        |
| `NEXT_PUBLIC_BUILD_VERSION` | Kennung des Builds; leer = kein Update-Hinweis    |
| `NEXT_PUBLIC_APP_USER`      | Benutzername am Anmeldefenster (Standard `admin`) |
| `NEXT_PUBLIC_APP_PASSWORD`  | Passwort am Anmeldefenster (Standard `admin`)     |

`NEXT_PUBLIC_BUILD_VERSION` setzt der Deploy-Workflow auf den Commit und legt
dieselbe Kennung als `version.json` neben die Anwendung. Lokal ist die Variable
leer, dann sucht die App nicht nach Updates.

## Tests

`npm test` deckt die Stellen ab, an denen Fehler still bleiben: Cent-Parsen und
-Runden, Periodengrenzen bei abweichendem Starttag, Restbetrag und Übertrag
über mehrere Perioden, Termine wiederkehrender Regeln (inklusive 31. im
Februar), Idempotenz der Materialisierung, Rechteprüfung im Adapter und der
Merge-Import bei Revisionskonflikt.

`npm run test:e2e` fährt den Alltagsweg durch und prüft zusätzlich Anmeldung,
Rechtsseiten, Suche und Filter, Dunkelmodus, Betragseingabe und die Scrollsperre
unter Overlays — je einmal bei 390 px und bei 1440 px. In Umgebungen mit
vorinstalliertem Chromium:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

## Weiterlesen

- `STATE.md` — aktueller Projektstand und offene Punkte
- `AGENTS.md` — die Regeln, nach denen in diesem Projekt gearbeitet wird
- `docs/roadmap-server.md` — Weg zu zentraler Datenbank und SSO
