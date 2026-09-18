import type { Page } from '@playwright/test';

/**
 * Setzt den Entsperr-Merker, bevor die erste Seite lädt.
 *
 * Ohne das landet jeder Test zuerst im Anmeldefenster. Die Anmeldung selbst
 * prüft `login.spec.ts`; die übrigen Tests sollen den Alltag prüfen und nicht
 * jedes Mal dieselbe Tür aufmachen.
 *
 * Muss den Schlüssel aus `lib/auth/local-credentials.ts` spiegeln — er steht
 * hier als Literal, weil der Testcode nicht gegen das Anwendungsbundle
 * gebaut wird.
 */
const UNLOCK_KEY = 'haushalt.unlocked';

export async function entsperren(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Ohne Speicher bleibt das Anmeldefenster stehen — der Test schlägt
      // dann sichtbar fehl statt still etwas anderes zu prüfen.
    }
  }, UNLOCK_KEY);
}

/**
 * Die Breite, ab der Tailwind `md:` greift. Der schwebende Knopf ist
 * `md:hidden`, der Knopf auf der Seite `hidden md:block` — welcher da ist,
 * entscheidet also allein das Fenster.
 */
const MD_BREAKPOINT = 768;

/**
 * Öffnet das Erfassen über den schwebenden Knopf (mobil) oder den Knopf auf
 * der Seite (Desktop) und wählt die Art.
 *
 * Die Entscheidung fällt über die Fensterbreite, nicht über `isVisible()`:
 * Das wartet nicht und liefert direkt nach einem Seitenwechsel `false`,
 * bevor der Knopf überhaupt gerendert ist — der Test landete dann still im
 * falschen Zweig.
 */
export async function erfassenOeffnen(page: Page, art: 'Ausgabe' | 'Einnahme'): Promise<void> {
  const breite = page.viewportSize()?.width ?? MD_BREAKPOINT;

  if (breite < MD_BREAKPOINT) {
    await page.getByRole('button', { name: 'Buchung erfassen' }).click();
    await page.getByRole('button', { name: new RegExp(`^${art}`) }).click();
    return;
  }

  // Desktop: Knopf auf der Seite, Art danach im Sheet.
  await page.getByRole('button', { name: 'Ausgabe erfassen' }).click();
  if (art === 'Einnahme') await page.getByRole('radio', { name: 'Einnahme' }).click();
}
