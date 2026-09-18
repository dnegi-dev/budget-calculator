/**
 * Die Kennung dieses Builds.
 *
 * Wird vom Deploy-Workflow auf den Commit gesetzt (`NEXT_PUBLIC_BUILD_VERSION`)
 * und beim Build in das Bundle eingesetzt — genauso wie `NEXT_PUBLIC_BASE_PATH`
 * in `lib/base-path.ts`. Derselbe Workflow legt `version.json` neben die
 * Anwendung; wer beides vergleicht, weiß, ob eine neuere Fassung veröffentlicht
 * wurde.
 *
 * Lokal und im Test ist der Wert leer. Dann ist die Prüfung **aus**: In der
 * Entwicklung gibt es keine Veröffentlichung, gegen die zu vergleichen wäre,
 * und eine Hinweisleiste im E2E-Lauf würde nur Klicks abfangen.
 */
export const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? '';

/** Liegt neben der Anwendung, nicht in `public/` — erzeugt der Workflow. */
export const VERSION_FILE = '/version.json';
