import { expect, test } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen } from './helpers';

/**
 * Kein Scrollen im Hintergrund, solange ein Overlay offen ist.
 *
 * Der Fehler, den das festhält: Das Sheet setzte `body.style.overflow =
 * 'hidden'` — wirkungslos, weil `app/globals.css` am Wurzelelement
 * `overflow-x: hidden` setzt und CSS die andere Achse dann von `visible` auf
 * `auto` rechnet. Damit war `html` der Scrollcontainer, und das `overflow` des
 * Body wurde nicht mehr auf den Viewport übertragen.
 *
 * Geprüft wird deshalb der Mechanismus und nicht nur das Ergebnis in Pixeln:
 * Ob die Seite überhaupt hoch genug zum Scrollen ist, hängt vom Fenster und
 * von der Zahl der Töpfe ab.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Overlays', () => {
  test('sperren den Hintergrund und geben die Scrollposition zurück', async ({ page }) => {
    await einrichten(page);

    const scrollbar = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 40,
    );
    if (scrollbar) await page.evaluate(() => window.scrollTo(0, 120));
    const vorher = await page.evaluate(() => window.scrollY);

    await erfassenOeffnen(page, 'Ausgabe');
    await expect(page.getByRole('dialog')).toBeVisible();

    const gesperrt = await page.evaluate(() => ({
      wurzel: getComputedStyle(document.documentElement).overflowY,
      position: getComputedStyle(document.body).position,
    }));
    expect(gesperrt.wurzel).toBe('hidden');
    expect(gesperrt.position).toBe('fixed');

    if (scrollbar) {
      await page.mouse.wheel(0, 400);
      await expect
        .poll(async () => page.evaluate(() => window.scrollY))
        .toBe(vorher === 0 ? 0 : vorher);
    }

    await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    const danach = await page.evaluate(() => ({
      wurzel: getComputedStyle(document.documentElement).overflowY,
      scrollY: window.scrollY,
    }));
    expect(danach.wurzel).not.toBe('hidden');
    expect(danach.scrollY).toBe(vorher);
  });
});
