import { expect, test } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen, istMobil } from './helpers';

/**
 * Die Buchungsseite nach dem Umbau: Suche hinter der Lupe — an jeder Breite,
 * seit die klebende Leiste sie überall gleich führt —, Erfassen nur noch am
 * Schreibtisch, und die Regeln als Unterseite.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Buchungen', () => {
  test('Suche hinter der Lupe, Erfassen nur ab md, Regeln als Unterseite', async ({ page }) => {
    await einrichten(page);

    // Eine Buchung mit einem Ort, nach dem sich suchen lässt.
    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('1999');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Wohnen/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByLabel('Firma').fill('Baumarkt');
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByRole('heading', { name: 'Buchungen', level: 1 })).toBeVisible();

    const erfassen = page.getByRole('button', { name: '+ Erfassen' });
    const suchfeld = page.locator('input[type="search"]:visible');

    // Der Erfassen-Knopf ist mobil doppelt zum schwebenden — deshalb erst ab
    // `md`. Das Suchfeld liegt an jeder Breite hinter der Lupe.
    if (istMobil(page)) await expect(erfassen).toBeHidden();
    else await expect(erfassen).toBeVisible();

    await expect(suchfeld).toHaveCount(0);
    await page.getByRole('button', { name: 'Suchen' }).click();

    await suchfeld.fill('Baumarkt');
    await expect(page.getByText('1 Buchung', { exact: false })).toBeVisible();

    await suchfeld.fill('Zahnpasta');
    await expect(page.getByText('0 Buchungen')).toBeVisible();

    // Dieselbe Lupe schließt wieder, und das Schließen räumt den Begriff weg:
    // Ein unsichtbarer Filter, der weiter wirkt, wäre schlechter.
    await page.getByRole('button', { name: 'Suchen' }).click();
    await expect(suchfeld).toHaveCount(0);
    await expect(page.getByText('1 Buchung', { exact: false })).toBeVisible();

    // Das Symbol zu den wiederkehrenden Buchungen ist aus der Leiste
    // verschwunden: Eine Regel legt man einmal an und sieht sie jahrelang
    // nicht wieder — der Platz dort gehört dem Täglichen.
    await expect(page.getByRole('link', { name: 'Wiederkehrende Buchungen' })).toHaveCount(0);
  });

  test('Wiederkehrende Buchungen stehen in den Einstellungen', async ({ page }) => {
    await einrichten(page);
    await page.getByRole('link', { name: 'Einstellungen' }).first().click();
    await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();

    /*
      Der Eintrag ist nicht Bequemlichkeit: Regeln **ohne** Topf (Gehalt
      läuft auf den Haushalt) sind nur hier verwaltbar. Ohne ihn liefen sie
      still weiter und wären nicht mehr erreichbar.
    */
    await page.getByRole('link', { name: /^Wiederkehrende Buchungen/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Wiederkehrende Buchungen', level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Regel' })).toBeVisible();
  });
});
