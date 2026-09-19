import { expect, test, type Page } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen } from './helpers';

/**
 * Die klebende Leiste über den Listen.
 *
 * Geprüft wird nicht, dass sie da ist, sondern dass sie beim Scrollen oben
 * bleibt **und** der Datumskopf der Buchungsliste darunter klebt statt
 * dahinter. Der zweite Teil ist der, der leicht kaputtgeht: Der Datumskopf
 * rechnet mit `--list-toolbar-h`, und diese Variable setzt die Leiste zur
 * Laufzeit.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

/** Eine Ausgabe auf den ersten Vorschlagstopf, nur um die Liste zu füllen. */
async function ausgabeErfassen(page: Page, betrag: string) {
  await erfassenOeffnen(page, 'Ausgabe');
  await page.getByLabel('Betrag').fill(betrag);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: /Wohnen/ }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test.describe('Klebende Leiste', () => {
  test('Überschrift und Symbole bleiben oben, der Datumskopf darunter', async ({ page }) => {
    await einrichten(page);
    for (const betrag of ['1000', '2000', '3000', '4000']) {
      await ausgabeErfassen(page, betrag);
    }

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByRole('heading', { name: 'Buchungen', level: 1 })).toBeVisible();

    /*
      Ein flaches Fenster, damit vier Buchungen schon zum Scrollen reichen.
      Zweihundert anzulegen würde dasselbe zeigen und zwei Minuten dauern.
    */
    const vorher = page.viewportSize();
    await page.setViewportSize({ width: vorher?.width ?? 390, height: 420 });

    const titel = page.getByRole('heading', { name: 'Buchungen', level: 1 });
    const datumskopf = page.locator('p.sticky').first();
    await expect(datumskopf).toBeVisible();

    await page.mouse.wheel(0, 600);
    // Warten, bis das Scrollen angekommen ist — sonst messen wir die Lage von
    // vorher und der Test wäre auch grün, wenn nichts klebte.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

    // Die Überschrift ist noch da, nicht nach oben weggescrollt.
    await expect(titel).toBeInViewport();
    const kopf = await titel.boundingBox();
    expect(kopf?.y ?? 999).toBeLessThan(80);

    // Und der Datumskopf klebt **unter** der Leiste.
    const leiste = await page.locator('div.sticky').first().boundingBox();
    const datum = await datumskopf.boundingBox();
    expect(datum?.y ?? 0).toBeGreaterThanOrEqual((leiste?.y ?? 0) + (leiste?.height ?? 0) - 1);

    await page.setViewportSize({ width: vorher?.width ?? 390, height: vorher?.height ?? 800 });
  });

  test('die Suche bleibt beim Scrollen erreichbar', async ({ page }) => {
    await einrichten(page);
    await ausgabeErfassen(page, '1234');

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    const vorher = page.viewportSize();
    await page.setViewportSize({ width: vorher?.width ?? 390, height: 420 });

    await page.mouse.wheel(0, 600);
    // Genau der Fall, für den die Leiste klebt: unten in der Liste suchen,
    // ohne erst wieder hochzuscrollen.
    await page.getByRole('button', { name: 'Suchen' }).click();
    // `type="search"` ist eine `searchbox`, keine `textbox`.
    await page.getByRole('searchbox', { name: 'Suche' }).fill('gibtsnicht');
    await expect(page.getByText('0 Buchungen')).toBeVisible();

    await page.setViewportSize({ width: vorher?.width ?? 390, height: vorher?.height ?? 800 });
  });
});
