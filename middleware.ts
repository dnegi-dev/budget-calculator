/**
 * Durchlass-Middleware.
 *
 * v1 hat keinen Server-Anteil (`output: 'export'` in next.config.ts), also
 * läuft diese Datei derzeit nicht. Sie liegt hier, weil beim Einbau von SSO
 * genau dieses Gerüst gebraucht wird: der Matcher, der öffentliche von
 * geschützten Pfaden trennt.
 *
 * Für SSO wird der Rumpf ersetzt durch:
 *
 *   export { auth as middleware } from '@/lib/auth/auth';
 *
 * und `config.matcher` bleibt, wie er ist.
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
