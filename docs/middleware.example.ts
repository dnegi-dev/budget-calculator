/**
 * Vorlage für die Middleware — noch nicht aktiv.
 *
 * Liegt bewusst unter `docs/` und nicht als `middleware.ts` in der
 * Projektwurzel: Bei `output: 'export'` bricht Next mit einer Fehlermeldung ab,
 * wenn eine Middleware existiert. Als Datei hier stört sie nicht, und das
 * Gerüst, das beim Einbau von SSO gebraucht wird, ist trotzdem festgehalten.
 *
 * Beim Wechsel auf Serverbetrieb (siehe roadmap-server.md, Schritt 1 und 4):
 * nach `middleware.ts` in die Projektwurzel verschieben und den Rumpf durch
 *
 *   export { auth as middleware } from '@/lib/auth/auth';
 *
 * ersetzen. `config.matcher` bleibt, wie er ist.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_request: NextRequest) {
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
