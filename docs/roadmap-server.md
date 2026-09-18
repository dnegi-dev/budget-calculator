# Vom lokalen Betrieb zur zentralen DB mit SSO

Version 1 läuft ohne Server. Dieses Dokument beschreibt, was für den Wechsel zu
tun ist — und was dafür bereits vorbereitet wurde, damit der Schritt klein
bleibt.

## Was schon liegt

| Vorbereitung                                          | Ort                                  | Warum das den Aufwand senkt                                                                       |
| ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `BudgetRepository` als einzige Datenschnittstelle     | `lib/data/repository.ts`             | Kein UI-Code kennt die Speicherung. Der Wechsel betrifft eine Datei.                              |
| HTTP-Adapter mit identischer Signatur                 | `lib/data/remote/http-repository.ts` | Ausfüllen statt Umbauen; das Interface wurde von zwei Seiten benutzt.                             |
| Alle Methoden `async`                                 | `lib/data/repository.ts`             | Keine Signatur ändert sich, wenn Aufrufe über das Netz gehen.                                     |
| Clientseitige UUIDs                                   | `lib/domain/ids.ts`                  | Bestehende Daten können unverändert hochgeladen werden; keine Referenz muss umgeschrieben werden. |
| `revision`, `updatedAt`, `deletedAt` auf jedem Record | `lib/domain/types.ts`                | Konflikte sind entscheidbar, Löschungen übertragbar.                                              |
| Outbox `changeLog`                                    | `lib/data/local/db.ts`               | Der lokale Änderungsverlauf existiert bereits; ein Sync-Worker kann ihn abarbeiten.               |
| Zod-Schemas für alle Entitäten                        | `lib/domain/schemas.ts`              | Dieselbe Definition validiert Import und später die API-Grenze.                                   |
| Session-Abstraktion                                   | `lib/auth/`                          | Komponenten fragen `useSession()`, nicht „es gibt einen Admin".                                   |
| Rechtematrix, im Adapter erzwungen                    | `lib/rbac/`                          | Die Prüfungen liegen an einer Stelle und wandern unverändert in den Server.                       |
| `externalSubject` auf `User`                          | `lib/domain/types.ts`                | Platz für den OIDC-`sub`, ohne Migration.                                                         |
| Proxy-Gerüst                                          | `docs/proxy.example.ts`              | Der Matcher für geschützte Pfade steht.                                                           |
| `.env.example`                                        | Projektwurzel                        | Alle nötigen Variablen sind benannt und kommentiert.                                              |

## Schritte

### 1. Serverbetrieb einschalten

`output: 'export'` aus `next.config.ts` entfernen. Danach stehen Route
Handlers, Server Actions und Proxy zur Verfügung.

Nebenwirkung: `app/toepfe/detail/page.tsx` liest die Topf-ID aus einem
Query-Parameter, weil eine dynamische Route beim statischen Export alle IDs zur
Bauzeit bräuchte. Ab hier kann daraus `app/toepfe/[id]/page.tsx` werden.

### 2. Datenbank

`DATABASE_URL` setzen, Prisma (oder Drizzle) einrichten. Das Schema folgt
`lib/domain/types.ts` eins zu eins; die Zod-Schemas in
`lib/domain/schemas.ts` sind die Referenz für Pflichtfelder und Wertebereiche.

Wichtig: `amountCents` als `Integer`, nicht `Decimal` oder `Float`. Und
`householdId` auf jeder Tabelle, damit Zeilen nach Haushalt getrennt bleiben.

### 3. API

Je Repository-Methode ein Route Handler unter `app/api/`. Reihenfolge nach
Nutzen: `GET /api/snapshot` zuerst — damit läuft die Oberfläche bereits
lesend. Dann die Mutationen.

Jeder Handler:

1. Session lesen (Schritt 4),
2. Eingabe mit dem Zod-Schema prüfen,
3. `assertCan(principal, permission, resource)` — dieselbe Funktion wie lokal,
4. schreiben und die neue `revision` zurückgeben.

### 4. SSO

Auth.js einrichten, OIDC-Provider konfigurieren (`AUTH_OIDC_*` in
`.env.example`). Dann:

- `docs/proxy.example.ts` nach `proxy.ts` in die Projektwurzel verschieben und den Rumpf durch den Auth.js-Handler ersetzen, Matcher behalten. In Next 16 heißt die Datei `proxy.ts` und die Funktion `proxy` — `middleware` ist deprecated. Welchen Export Auth.js dafür anbietet, steht in dessen Doku zum Zeitpunkt des Einbaus.
- `lib/auth/provider.tsx` gegen einen Provider tauschen, der die Auth.js-Session liest und über `externalSubject` den `User`-Record findet. Fehlt er, mit `AUTH_DEFAULT_ROLE` anlegen.
- Nichts anderes anfassen: Komponenten benutzen bereits `useSession()` und `useCan()`.

### 5. Synchronisation der bestehenden lokalen Daten

Der Fall, der ohne Vorbereitung teuer wäre: Jemand hat ein Jahr lokal gebucht
und meldet sich erstmals an.

1. `NEXT_PUBLIC_DATA_MODE=remote` schaltet den HTTP-Adapter ein.
2. Ein Sync-Worker liest `changeLog` aufsteigend nach `at` und schickt die
   zugehörigen Records an die API. Weil IDs clientseitig erzeugt wurden, ist das
   ein reines Hochladen ohne Umschreiben.
3. Konflikt: höhere `revision` gewinnt — dieselbe Regel, die der Merge-Import
   in `importAll()` schon benutzt. Diese Logik ist getestet und kann als
   Vorlage dienen.
4. Nach erfolgreichem Upload die abgearbeiteten `changeLog`-Zeilen löschen.

Zwischenschritt ohne Worker: Der Nutzer exportiert JSON und lädt es über die
API hoch. Das nimmt einen Großteil des Drucks von Schritt 5.

### 6. Belege

Blobs gehören nicht in die Datenbank. Objektspeicher (S3-kompatibel) einrichten
und `addReceipt`/`getReceipt` auf vorsignierte URLs umstellen. `ReceiptMeta`
bleibt, wie es ist — es trägt schon `mime` und `byteSize`, und die Oberfläche
arbeitet nur mit Metadaten plus Blob-URL.

### 7. Was dann noch zu entscheiden ist

- **Limit-Historie.** Der Übertrag rechnet vergangene Perioden mit dem
  _aktuellen_ Limit (siehe Kommentar in `lib/domain/ledger.ts`). Für mehrere
  Nutzer über längere Zeiträume lohnt ein Feld `limitHistory`.
- **`resetLocalDeviceRole()`** darf serverseitig nicht existieren. Der Stub
  wirft bereits.
- **Feinere Invalidierung.** Heute lädt jede Mutation den ganzen Snapshot neu.
  Lokal ist das unmessbar, über das Netz nicht. Der Weg dorthin ist offen,
  weil `subscribe()` schon die Schnittstelle dafür ist.
- **Mandantentrennung.** `householdId` liegt überall an; zu klären ist nur, wer
  jemanden in einen Haushalt einladen darf (`member.manage`).
