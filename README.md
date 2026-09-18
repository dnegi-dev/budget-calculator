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

Beim ersten Aufruf führt ein Wizard durch die Einrichtung: Haushaltsname,
Währung, Periodenstart, Töpfe, optional ein regelmäßiges Einkommen.

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | statisches Bundle nach `out/` |
| `npm run serve` | `out/` lokal ausliefern |
| `npm run typecheck` | TypeScript ohne Emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest (Domänenlogik und Datenschicht) |
| `npm run test:e2e` | Playwright-Smoke-Test |
| `npm run format` | Prettier |

`npm run build` erzeugt ein rein statisches Bundle — es lässt sich von jedem
Webserver und aus jedem Objektspeicher ausliefern.

## Funktionsumfang

- **Töpfe** in drei Arten, pro Topf wählbar:
  - *Monatsbudget* — fester Betrag pro Periode, Reste verfallen.
  - *Budget mit Übertrag* — Restbeträge und Überziehungen wandern in die nächste Periode.
  - *Nur Kategorie* — kein Limit, zeigt nur die tatsächlichen Ausgaben.

  Die Art ist ein Preset über zwei Schaltern (`limitCents`, `carryOver`); im
  Topf-Detail lassen sich abweichende Kombinationen einstellen.
- **Buchungen** als Ausgabe oder Einnahme, mit Datum, Ort und Notiz. Erfassung
  in drei Schritten, ab dem ersten speicherbar.
- **Kassenzettel** als Nachweis zu einer Buchung — fotografieren oder Datei
  wählen. Bewusst ohne Auslesen: der Beleg belegt eine Änderung im Topf, mehr
  nicht.
- **Wiederkehrende Buchungen** (wöchentlich, monatlich, jährlich, mit
  Intervall) für Miete, Abos, Gehalt. Buchungen entstehen beim Öffnen der App,
  idempotent.
- **Auswertung**: Einnahmen, Ausgaben, Saldo sowie Verlauf, Ausgaben pro Topf
  und Anteile.
- **Export/Import**: JSON als vollständige Sicherung (optional mit Belegen),
  CSV für Tabellenprogramme.
- **Rollen** Admin / Nutzer / Nur Lesen — wirksam, nicht dekorativ.

### Bedienung auf beiden Plattformen

Mobil steht die Navigation unten und die Erfassung als Bottom Sheet; ab
Tablet-Breite gibt es eine Seitenleiste und mehrspaltige Auswertung. Die Routen
und der Funktionsumfang sind identisch — nur die Anordnung unterscheidet sich.

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

| Variable | Bedeutung |
| --- | --- |
| `NEXT_PUBLIC_DATA_MODE` | `local` (Standard) oder `remote` |
| `NEXT_PUBLIC_CHANGE_LOG` | `on` (Standard) oder `off` |

## Tests

`npm test` deckt die Stellen ab, an denen Fehler still bleiben: Cent-Parsen und
-Runden, Periodengrenzen bei abweichendem Starttag, Restbetrag und Übertrag
über mehrere Perioden, Termine wiederkehrender Regeln (inklusive 31. im
Februar), Idempotenz der Materialisierung, Rechteprüfung im Adapter und der
Merge-Import bei Revisionskonflikt.

`npm run test:e2e` fährt den Alltagsweg einmal durch. In Umgebungen mit
vorinstalliertem Chromium:

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```
