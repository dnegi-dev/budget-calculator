# Projektstand

Kurzer, pflegbarer Überblick: was steht, was bewusst fehlt, was als Nächstes
ansteht. Bei größeren Änderungen mitführen.

**Stand:** 18.09.2026 · **Version:** 0.1.0 · **Zweig:** `main`

## Wo das Projekt steht

Die Anwendung ist funktionsfähig und wird über GitHub Pages veröffentlicht.
Sie speichert ausschließlich lokal im Browser; es gibt keinen Server, kein
Konto und keine Übertragung.

| Bereich                                          | Stand                                                        |
| ------------------------------------------------ | ------------------------------------------------------------ |
| Töpfe (Monatsbudget, Übertrag, reine Kategorie)  | fertig                                                       |
| Buchungen erfassen, bearbeiten, filtern          | fertig                                                       |
| Kassenzettel als Nachweis                        | fertig, bewusst ohne Auswertung des Inhalts                  |
| Wiederkehrende Buchungen                         | fertig, Materialisierung beim App-Start                      |
| Auswertung (Kennzahlen, Verlauf, Töpfe, Anteile) | fertig                                                       |
| Export/Import (JSON, CSV)                        | fertig                                                       |
| Rollen Admin/Nutzer/Nur Lesen                    | wirksam, im Repository erzwungen                             |
| PWA (Manifest, Icons, Offline-Start)             | fertig                                                       |
| Impressum, Datenschutz                           | **Gerüst mit Platzhaltern — vor Veröffentlichung ausfüllen** |
| Zentrale Datenbank, SSO                          | vorbereitet, nicht eingeschaltet                             |

**Prüfstand:** 118 Unit-Tests (`npm test`), 4 E2E-Tests auf zwei Viewports
(`npm run test:e2e`), typecheck und lint grün, statischer Build erzeugt.
CI prüft jeden Pull Request, der Deploy-Workflow prüft erneut vor der
Veröffentlichung.

## Wo die Daten liegen

IndexedDB-Datenbank `haushaltsplanung` im Browser des Geräts, Belege als Blob
in derselben Datenbank. Daraus folgt das Wichtigste für Nutzer: **Der
Browser-Speicher ist die einzige Kopie.** Wer Website-Daten löscht, löscht den
Haushalt. Der JSON-Export in den Einstellungen ist die Sicherung; die
Ersteinrichtung kann eine solche Datei wieder einlesen.

## Bewusst nicht enthalten

Kein Server, keine Anmeldung, keine Synchronisation zwischen Geräten, keine
Texterkennung auf Belegen, keine Bank-Anbindung, keine Mandantenverwaltung
über den vorbereiteten Rollen-Code hinaus.

## Offene Punkte

1. **Impressum und Datenschutz ausfüllen.** `app/impressum/page.tsx` und
   `app/datenschutz/page.tsx` enthalten Platzhalter und zeigen einen sichtbaren
   Warnhinweis. Solange der steht, erfüllt die Seite keine gesetzliche Pflicht.
2. **GitHub Pages aktivieren.** Settings → Pages → Source auf „GitHub Actions".
   Einmalig, kann nicht aus dem Repository heraus gesetzt werden.
3. **Limit-Historie für den Übertrag.** Der Übertrag rechnet vergangene
   Perioden mit dem _aktuellen_ Limit — wer das Limit ändert, ändert ihn
   rückwirkend. Dokumentiert in `lib/domain/ledger.ts`; ein Feld
   `limitHistory` am Topf wäre der Weg.
4. **Server-Schritt.** Wenn zentrale Speicherung und SSO dazukommen sollen:
   `docs/roadmap-server.md` beschreibt die Reihenfolge und was dafür schon
   vorbereitet ist.
5. **Feinere Invalidierung.** Heute lädt jede Mutation den ganzen Snapshot neu.
   Lokal unmessbar, über das Netz nicht — relevant erst mit Schritt 4.

## Orientierung im Code

```
app/              Routen (App Router), alle clientseitig
components/       fachliche Komponenten
lib/domain/       reine Logik: Geld, Perioden, Topf-Arten, Restbeträge, Termine
lib/data/         BudgetRepository + Dexie-Adapter + HTTP-Adapter (Stub)
lib/auth/         Session-Abstraktion (v1: lokaler Gerätenutzer)
lib/rbac/         Rechtematrix und Prüfung
lib/ui/           Primitive: Sheet, Button, AmountInput, Progress …
docs/             Server-Roadmap und Proxy-Vorlage für SSO
```

Die Regeln, nach denen hier gearbeitet wird, stehen in `AGENTS.md`.
