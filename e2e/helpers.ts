import { expect, type Page } from '@playwright/test';

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

/**
 * Ersteinrichtung im Schnelldurchlauf.
 *
 * Die Vorschlagstöpfe bleiben wie sie sind — die Tests, die diesen Helfer
 * benutzen, prüfen nicht den Wizard (das macht `alltag.spec.ts`), sondern
 * brauchen nur einen eingerichteten Haushalt.
 */
export async function einrichten(page: Page, name = 'Testhaushalt'): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Name des Haushalts').fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: 'Währung und Periode' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: /Welche T/ })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: /Einkommen/ })).toBeVisible();
  await page.getByRole('button', { name: /Los geht/ }).click();

  await expect(page.getByRole('link', { name: /Wohnen/ })).toBeVisible();
}

/** Ob das Fenster schmaler ist als der `md`-Umbruch — mobile Oberfläche. */
export function istMobil(page: Page): boolean {
  return (page.viewportSize()?.width ?? MD_BREAKPOINT) < MD_BREAKPOINT;
}

/**
 * Wählt in einem Auswahlfeld die Option, deren Text den Begriff enthält.
 *
 * `selectOption({ label })` braucht den Text genau — und die Topf-Optionen
 * tragen ein Emoji davor. Über den Wert (die Topf-ID) ist es stabil, und ein
 * Regex-Label unterstützt Playwright nicht.
 */
export async function optionWaehlen(page: Page, feld: string, text: string): Promise<void> {
  const select = page.getByLabel(feld).first();
  const wert = await select.locator('option', { hasText: text }).first().getAttribute('value');
  if (wert === null) throw new Error(`Keine Option für ${text} in ${feld}`);
  await select.selectOption(wert);
}

/**
 * Klappt Suche und Filter auf der Buchungsseite auf, falls sie hinter den
 * Symbolen liegen (mobil). Ab `md` stehen sie ohnehin offen.
 */
export async function filterOeffnen(page: Page): Promise<void> {
  if (istMobil(page)) await page.getByRole('button', { name: 'Filter' }).click();
}

/**
 * Öffnet einen Punkt der Einstellungen.
 *
 * Seit die Einstellungen Unterseiten haben, sind es zwei Klicks: erst die
 * Übersicht, dann die Zeile. Der Name der Zeile enthält auch ihre Unterzeile,
 * deshalb der Anker am Anfang.
 */
export async function einstellungOeffnen(page: Page, punkt: string): Promise<void> {
  await page.getByRole('link', { name: 'Einstellungen' }).first().click();
  await page.getByRole('link', { name: new RegExp(`^${punkt}`) }).click();
  await expect(page.getByRole('heading', { name: punkt, level: 1 })).toBeVisible();
}
