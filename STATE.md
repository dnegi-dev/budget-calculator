# Projektstand

Kurzer, pflegbarer Überblick: was steht, was bewusst fehlt, was als Nächstes
ansteht. Bei größeren Änderungen mitführen.

**Stand:** 21.09.2026 · **Version:** 0.1.0 · **Zweig:** `main`

## Wo das Projekt steht

Die Anwendung ist funktionsfähig und wird über GitHub Pages veröffentlicht.
Sie speichert ausschließlich lokal im Browser; es gibt keinen Server, kein
Konto und keine Übertragung.

| Bereich                                            | Stand                                                        |
| -------------------------------------------------- | ------------------------------------------------------------ |
| Töpfe (Monatsbudget, Übertrag, reine Kategorie)    | fertig                                                       |
| Sparziel-Topf (Betrag, Frist, automatische Sperre) | fertig; Sperre über `lockedAt`, getrennt vom Archivieren     |
| Sparziel: Phasen-Schieberegler, eigene Wortwahl    | fertig; „Einzahlen"/„Ausgeben" nur im Sparziel-Kontext       |
| Ersteinrichtung: Einkommen, fester/freier Betrag   | fertig; acht Schritte, ein Beispiel je Topf-Art              |
| Topf-Eigenschaften direkt in den Einstellungen     | fertig; Zeile öffnet das Bearbeiten-Sheet ohne Seitenwechsel |
| Buchungen erfassen, bearbeiten, filtern            | fertig                                                       |
| Kassenzettel als Nachweis                          | fertig; Fotos bewusst ohne Auswertung des Inhalts            |
| PDF-Bon einlesen, Posten auf Töpfe verteilen       | fertig, mit Summenprobe und gelernten Zuordnungen            |
| Standardtopf für Ausgaben ohne Zuordnung           | fertig, schaltbar samt Topf-Abfrage beim Erfassen            |
| Tags als zweite Achse, mit Auswertung je Tag       | fertig, abschaltbar; an Buchung und Bon-Posten               |
| Wiederkehrende Buchungen                           | fertig, Materialisierung beim App-Start                      |
| Auswertung (Kennzahlen, Verlauf, Töpfe, Anteile)   | fertig                                                       |
| Export/Import (JSON, CSV)                          | fertig                                                       |
| Rollen Admin/Nutzer/Nur Lesen                      | wirksam, im Repository erzwungen                             |
| Anmeldung (`admin`/`admin`)                        | vorhanden — **Abschreckung, kein Zugriffsschutz**            |
| Darstellung hell/dunkel/automatisch                | fertig, pro Gerät im `localStorage`                          |
| Themes, Akzentfarbe, Symbolstil, echtes Schwarz    | fertig; jede Kombination auf Kontrast geprüft (Test)         |
| Einstellungen als Unterseiten mit Gefahrenzone     | fertig                                                       |
| Schwebender Knopf mit Standardaktion               | fertig; immer ein Plus, langes Drücken für die Art           |
| Klebende Leiste je Liste (Titel, Suche, Filter)    | fertig auf Heute, Buchungen, Wiederkehrend, Töpfe, Ordnen    |
| Monat und Tag kleben über der Buchungsliste        | fertig, zwei Zeilen unter der Werkzeugleiste                 |
| Buchung löschen (Wischen und Knopf)                | fertig, beides abschaltbar, Rückfrage voreingestellt         |
| Firma und Anschrift getrennt, Anschrift als Karte  | fertig; `geo:`-Verweis, kein Kartendienst im Netz            |
| Topf-Einstellungen am Zahnrad, eigenes Untermenü   | fertig; Regeln je Topf im selben Sheet                       |
| Impressum und Datenschutz über der unteren Leiste  | fertig, kleben sobald sie im Bild waren (mobil)              |
| Bon-Einzelposten, Topf und Tags je Posten          | fertig; Buchungen werden neu gerechnet, Beleg hängt um       |
| Bon-Profile je Kette (Erkennung, Produkt-Mappings) | fertig ohne Oberfläche; Verwaltung offen                     |
| Update-Hinweis bei neuer Fassung                   | fertig, Leiste mit „Neu laden“ — kein automatischer Reload   |
| PWA (Manifest, Icons, Offline-Start)               | fertig                                                       |
| Impressum, Datenschutz                             | **Gerüst mit Platzhaltern — vor Veröffentlichung ausfüllen** |
| Zentrale Datenbank, SSO                            | vorbereitet, nicht eingeschaltet                             |

**Prüfstand:** 696 Unit-Tests (`npm test`), 57 E2E-Tests auf zwei Viewports
(`npm run test:e2e`, 114 Läufe, davon 108 bestanden und 6 bewusste
Auslassungen — den schwebenden Knopf und die klebende Rechtsleiste gibt es ab
`md` nicht), typecheck und lint grün, statischer Build erzeugt.
CI prüft jeden Pull Request, der Deploy-Workflow prüft erneut vor der
Veröffentlichung.

## Wo die Daten liegen

IndexedDB-Datenbank `haushaltsplanung` im Browser des Geräts, Belege als Blob
in derselben Datenbank. Daraus folgt das Wichtigste für Nutzer: **Der
Browser-Speicher ist die einzige Kopie.** Wer Website-Daten löscht, löscht den
Haushalt. Der JSON-Export in den Einstellungen ist die Sicherung; die
Ersteinrichtung kann eine solche Datei wieder einlesen.

## Bewusst nicht enthalten

Kein Server, kein echter Zugriffsschutz, keine Synchronisation zwischen
Geräten, keine Texterkennung auf Foto-Belegen (PDF-Bons werden gelesen, Fotos
nicht), keine Bank-Anbindung, keine Mandantenverwaltung über den vorbereiteten
Rollen-Code hinaus.

## Offene Punkte

1. **Impressum und Datenschutz ausfüllen.** `app/impressum/page.tsx` und
   `app/datenschutz/page.tsx` enthalten Platzhalter und zeigen einen sichtbaren
   Warnhinweis. Solange der steht, erfüllt die Seite keine gesetzliche Pflicht.
2. **Echter Zugriffsschutz, falls gewünscht.** Die Anmeldung beim Öffnen hält
   nur Gelegenheitsbesucher ab: Das Bundle wird öffentlich ausgeliefert, und
   die Zugangsdaten stehen im Quelltext. Wer die Seite wirklich nicht-öffentlich
   braucht, kommt um eine serverseitige Abfrage vor der Auslieferung nicht
   herum — etwa Basic Auth oder ein Zugangsdienst vor einer eigenen Domain.
   GitHub Pages fällt dafür weg. Welche Variante im konkreten Fall passt, ist
   nicht geprüft.
3. **Barrierefreiheit der Overlays.** Sheets holen den Fokus, halten ihn aber
   nicht: keine Fokusfalle, kein `inert` auf dem Hintergrund, keine
   Fokus-Rückgabe beim Schließen. Mit der Tastatur läuft man aus dem Dialog
   heraus. Das Scrollen im Hintergrund ist gesperrt
   (`lib/ui/useScrollLock.ts`), der Rest fehlt.
4. **Limit-Historie für den Übertrag.** Der Übertrag rechnet vergangene
   Perioden mit dem _aktuellen_ Limit — wer das Limit ändert, ändert ihn
   rückwirkend. Dokumentiert in `lib/domain/ledger.ts`; ein Feld
   `limitHistory` am Topf wäre der Weg.
5. **Server-Schritt.** Wenn zentrale Speicherung und SSO dazukommen sollen:
   `docs/roadmap-server.md` beschreibt die Reihenfolge und was dafür schon
   vorbereitet ist.
6. **Feinere Invalidierung.** Heute lädt jede Mutation den ganzen Snapshot neu.
   Lokal unmessbar, über das Netz nicht — relevant erst mit Schritt 5.
7. **Cache-Reste.** Der Service Worker legt Dateien mit Hash im Namen
   unbegrenzt ab und räumt sie erst beim Hochzählen von `CACHE` weg. Bei dieser
   Größe unkritisch, aber es wächst.
8. **Bon-Import an weiteren Händlern prüfen.** Gegen zwei echte Bons geprüft,
   beide ohne `ekabs.json`, beide mit lesbarer Textschicht: eine Supermarkt-
   kette (18 Posten auf den Cent) und eine Drogeriekette (17 Posten, 30,75 €
   auf den Cent). Jeder der beiden hat
   einen eigenen Fehler aufgedeckt — beim ersten zählten die Bonus-Beträge der
   Fußzeile mit, beim zweiten passte wegen der Steuerklasse als Ziffer keine
   einzige Zeile. Ein dritter Bon hat inzwischen zwei weitere gebracht: eine
   Werbezeile über dem Händlernamen und die Menge hinter der Bezeichnung. Wie
   ein vierter Händler druckt, ist offen; die Muster unter
   `e2e/fixtures/` halten beide Aufbauten als Struktur fest.
9. **Tags an wiederkehrenden Regeln.** Eine Regel trägt heute keine Tags, die
   daraus erzeugten Buchungen also auch nicht. Das Feld an `RecurringRule`
   nachzuziehen ist klein; die Frage dahinter ist, ob eine Regel überhaupt
   Tags setzen soll oder ob das am erzeugten Datensatz passiert.
10. **Kein Rückgängig nach dem Löschen.** `deleteEntry` setzt `deletedAt`,
    löscht also weich — aber es gibt kein `restoreEntry` und keinen
    Papierkorb. Deshalb ist die Rückfrage beim Wischen voreingestellt an. Ein
    Papierkorb wäre eine eigene Runde: Er braucht eine Liste, eine Frist und
    eine Entscheidung, was mit den Belegen dazwischen passiert.
11. **Papierbons.** Der TSE-QR-Code enthält die Bruttobeträge je Steuersatz,
    aber keine Einzelposten; `zxing-wasm` (953 KB) wäre der Weg, weil
    `BarcodeDetector` in Safari und auf iOS fehlt. Einzelposten aus einem Foto
    bräuchten OCR und bleiben unzuverlässig.
12. **Bon-Import prüft die Sperre eines Sparziel-Topfes nicht.** Die
    Schreibsperre (`lockedAt`) gilt für `createEntries`, `updateEntry` und den
    Materialisierer wiederkehrender Buchungen — nicht für `createPurchase`
    und `updatePurchaseItem`. Das ist dieselbe Lücke, die für `archivedAt`
    an diesen beiden Stellen schon vorher bestand: Die Zuordnung eines
    Bon-Postens zu einem Topf prüfte dessen Zustand nie. Praktisch selten,
    weil ein gesperrter Topf ohnehin nicht mehr in der Auswahl der
    Bon-Vorschau steht — nur eine bestehende, direkt per ID vorbelegte
    Zuordnung käme daran vorbei.

## Orientierung im Code

```
app/              Routen (App Router), alle clientseitig
components/       fachliche Komponenten
lib/domain/       reine Logik: Geld, Perioden, Topf-Arten, Restbeträge, Termine
lib/data/         BudgetRepository + Dexie-Adapter + HTTP-Adapter (Stub)
lib/auth/         Session-Abstraktion (v1: lokaler Gerätenutzer)
lib/rbac/         Rechtematrix und Prüfung
lib/ui/           Primitive: Sheet, Button, AmountInput, Progress …
lib/prefs/        Einstellungen dieses Geräts (Darstellung, Themes, Betragseingabe)
lib/pdf/          pdf.js-Hülle für den Bon-Import (nachgeladen, nicht im Bundle)
docs/             Server-Roadmap und Proxy-Vorlage für SSO
```

Die Regeln, nach denen hier gearbeitet wird, stehen in `AGENTS.md`.
