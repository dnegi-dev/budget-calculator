/**
 * Vorlage für den Proxy — noch nicht aktiv.
 *
 * `middleware.ts` heißt in Next 16 `proxy.ts`; die alte Bezeichnung ist
 * deprecated (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`,
 * Versionstabelle in `proxy.md`: „v16.0.0 — Middleware is deprecated and
 * renamed to Proxy"). Funktional ist alles gleich geblieben, nur Datei- und
 * Funktionsname haben sich geändert. Wer älteren Code mitbringt, migriert ihn
 * mit `npx @next/codemod@canary middleware-to-proxy .`
 *
 * Liegt bewusst unter `docs/` und nicht als `proxy.ts` in der Projektwurzel:
 * Proxy steht in `static-exports.md` unter „Unsupported Features", ein
 * `proxy.ts` in der Wurzel bräche also den Export-Build. Als Datei hier stört
 * sie nicht, und das Gerüst für SSO ist trotzdem festgehalten.
 *
 * Beim Wechsel auf Serverbetrieb (siehe roadmap-server.md, Schritt 1 und 4):
 * nach `proxy.ts` in die Projektwurzel verschieben und den Rumpf durch den
 * Auth.js-Handler ersetzen. Wie dessen Export bei Next 16 heißt, steht in der
 * Auth.js-Doku zum Zeitpunkt des Einbaus — die Next-Seite verlangt genau eine
 * Funktion, entweder als Default-Export oder benannt `proxy`.
 * `config.matcher` bleibt, wie er ist.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Alles außer statischen Dateien, dem Manifest und dem Service Worker.
     * Nach Einführung von SSO wird hierüber der Anmeldezwang gesteuert.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)',
  ],
};
