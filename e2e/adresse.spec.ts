import { expect, test } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen } from './helpers';

/**
 * Firma und Anschrift als zwei Felder.
 *
 * Vorher trug ein Feld „Wo?" beides. Geprüft wird, dass die Trennung hält:
 * Der Name steht als Titel in der Liste, die Anschrift darunter gekürzt und
 * als Verweis auf die Karten-Anwendung — und gesucht wird über beides.
 */

const ANSCHRIFT = 'Beispielstraße 96, 12345 Musterstadt';

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Firma und Anschrift', () => {
  test('stehen getrennt, die Anschrift führt zur Karte', async ({ page }) => {
    await einrichten(page);

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('1999');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Wohnen/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByLabel('Firma').fill('Musterbaumarkt');
    await page.getByLabel('Wo?').fill(ANSCHRIFT);
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();

    // Der Name ist der Titel der Zeile.
    await expect(page.getByText('Musterbaumarkt').first()).toBeVisible();

    /*
      Die Anschrift steht darunter, gekürzt auf den Teil vor dem Komma — und
      als Verweis, nicht als Text. Das Ziel ist `geo:` und keine Adresse im
      Netz: Ein Kartendienst bekäme sonst die Anschrift zu sehen, und die
      Datenschutzerklärung sagt zu, dass nichts das Gerät verlässt.
    */
    const karte = page.getByRole('link', { name: 'Beispielstraße 96' });
    await expect(karte).toBeVisible();
    await expect(karte).toHaveAttribute('href', /^geo:0,0\?q=/);
    await expect(karte).not.toHaveAttribute('href', /https?:/);
    // Der volle Text geht nicht verloren, er steht im `title`.
    await expect(karte).toHaveAttribute('title', ANSCHRIFT);
  });

  test('die Suche findet auch über die Anschrift', async ({ page }) => {
    await einrichten(page);

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('1999');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Wohnen/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByLabel('Wo?').fill(ANSCHRIFT);
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await page.getByRole('button', { name: 'Suchen' }).click();
    const suchfeld = page.locator('input[type="search"]:visible');

    await suchfeld.fill('Musterstadt');
    await expect(page.getByText('1 Buchung', { exact: true })).toBeVisible();

    await suchfeld.fill('Nirgendwo');
    await expect(page.getByText('0 Buchungen')).toBeVisible();
  });
});
