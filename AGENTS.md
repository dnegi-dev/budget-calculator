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

## Rechtsseiten

`/impressum` und `/datenschutz` müssen **ohne** eingerichteten Haushalt
erreichbar bleiben; `components/AppGate.tsx` lässt sie über `PUBLIC_ROUTES`
durch. Beide Seiten enthalten Platzhalter und einen sichtbaren Warnhinweis —
der Hinweis verschwindet erst, wenn echte Angaben eingetragen sind.

Ändert sich, wie die App mit Daten umgeht (zentrale DB, Anmeldung, externe
Dienste), ist `app/datenschutz/page.tsx` mitzuändern. Der Text behauptet heute
belegbar, dass nichts das Gerät verlässt.
