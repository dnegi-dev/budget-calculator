import { expect, test } from '@playwright/test';
import { einrichten, einstellungOeffnen, entsperren } from './helpers';

/**
 * Themes, Akzent, Symbole, echtes Schwarz.
 *
 * Geprüft wird nicht, ob ein Knopf sich färbt, sondern ob das Attribut am
 * Wurzelelement steht und die Farbe daraus wirklich folgt. Der Reload gehört
 * dazu: Die Attribute setzt das Bootstrap-Skript aus `app/layout.tsx`, bevor
 * React übernimmt — ohne diese Prüfung merkt niemand, wenn das Skript falsch
 * liest und die Seite eine Sekunde lang hell aufblitzt.
 */

/**
 * Schwarz, in beiden Schreibweisen.
 *
 * Die Tokens sind `oklch()`, und Chromium gibt eine daraus berechnete Farbe
 * als `lab(0 0 0)` zurück, nicht als `rgb(0, 0, 0)` — je nachdem, ob die
 * Fläche aus einem Farbraum stammt, den es in sRGB darstellen kann. Beide
 * Schreibweisen meinen dasselbe Schwarz.
 */
const SCHWARZ = /^(rgb\(0, 0, 0\)|lab\(0 0 0\)|color\(srgb 0 0 0\))$/;

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Darstellung', () => {
  test('Theme je Modus, über einen Reload hinweg', async ({ page }) => {
    await einrichten(page);
    await einstellungOeffnen(page, 'Darstellung');

    const wurzel = page.locator('html');
    await expect(wurzel).toHaveAttribute('data-mode', 'light');
    await expect(wurzel).toHaveAttribute('data-theme', 'classic');

    // Das Theme für dunkel lässt sich setzen, während hell gilt — genau
    // dafür stehen beide Listen auf der Seite.
    const dunkelKarte = page.locator('section', { hasText: 'Theme bei dunkel' }).last();
    await dunkelKarte.getByRole('button', { name: /^Cyberpunk/ }).click();
    await expect(wurzel).toHaveAttribute('data-theme', 'classic');

    await page.getByRole('radio', { name: 'Dunkel' }).click();
    await expect(wurzel).toHaveAttribute('data-mode', 'dark');
    await expect(wurzel).toHaveAttribute('data-theme', 'cyberpunk');

    await page.reload();
    await expect(wurzel).toHaveAttribute('data-mode', 'dark');
    await expect(wurzel).toHaveAttribute('data-theme', 'cyberpunk');

    // Cyberpunk bietet Magenta an, Klassisch nicht: Der Akzent wird beim
    // Wechsel mit aufgeräumt statt auf einen Wert zu zeigen, den die Liste
    // nicht kennt.
    await expect(wurzel).toHaveAttribute('data-accent', 'magenta');
    const hellKarte = page.locator('section', { hasText: 'Theme bei hell' }).first();
    await hellKarte.getByRole('button', { name: /^Pastell/ }).click();
    await page.getByRole('radio', { name: 'Hell' }).click();
    await expect(wurzel).toHaveAttribute('data-theme', 'pastel');
    await expect(wurzel).toHaveAttribute('data-accent', 'rose');
  });

  test('echtes Schwarz macht den Hintergrund schwarz', async ({ page }) => {
    await einrichten(page);
    await einstellungOeffnen(page, 'Darstellung');

    await page.getByRole('radio', { name: 'Dunkel' }).click();
    const vorher = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(vorher).not.toMatch(SCHWARZ);

    await page
      .getByRole('radiogroup', { name: 'Echtes Schwarz' })
      .getByRole('radio', { name: 'An' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-amoled', '');
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toMatch(SCHWARZ);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-amoled', '');
  });

  test('Akzent und Strichstärke der Symbole wirken', async ({ page }) => {
    await einrichten(page);
    await einstellungOeffnen(page, 'Darstellung');

    await page.getByRole('button', { name: 'Smaragd' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'emerald');

    await page.getByRole('radio', { name: 'Fett' }).click();
    // Die Strichstärke steht am gerenderten SVG — nicht nur in der Vorschau.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const nav = document.querySelector('nav[aria-label="Hauptnavigation"] svg');
          return nav?.getAttribute('stroke-width') ?? null;
        }),
      )
      .toBe('2.5');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'emerald');
  });
});
