import { expect, test } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen, optionWaehlen } from './helpers';

/**
 * Die Einzelposten eines Bons, nachdem er gebucht ist.
 *
 * Der Test geht genau den Weg, um den es beim Wunsch ging: Bon einlesen,
 * später merken, dass ein Posten im falschen Topf steckt, ihn umhängen — und
 * prüfen, dass die Buchungen dazu passen und der Beleg noch da ist.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

/** Liest das Muster mit `ekabs.json` ein und legt alles auf „Wohnen". */
async function bonBuchen(page: Parameters<typeof einrichten>[0]) {
  await erfassenOeffnen(page, 'Ausgabe');
  await page.getByRole('button', { name: /Aus PDF-Bon einlesen/ }).click();
  await page.setInputFiles(
    'input[type="file"][accept="application/pdf"]',
    'e2e/fixtures/bon-ekabs.pdf',
  );
  await expect(page.getByText('Aus dem Beleg selbst gelesen.')).toBeVisible();
  await optionWaehlen(page, 'Alles auf einen Topf', 'Wohnen');
  await page.getByRole('button', { name: 'Buchung anlegen' }).click();
}

test.describe('Einkauf', () => {
  test('ein Posten wechselt den Topf, die Buchungen rechnen sich neu', async ({ page }) => {
    await einrichten(page);
    await bonBuchen(page);

    // Aus der Erfolgsmeldung direkt in den Einkauf.
    await page
      .getByRole('dialog', { name: 'Gebucht' })
      .getByRole('link', { name: 'Einkauf ansehen' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: /Musterbäckerei/ })).toBeVisible();

    // Alles auf „Wohnen": eine Buchung über die Endsumme.
    await expect(page.getByText('1 Buchung', { exact: true })).toBeVisible();
    await expect(page.getByText('4,50', { exact: false }).first()).toBeVisible();

    // „Kaffee to go" gehört zu Mobilität.
    await optionWaehlen(page, 'Topf für „Kaffee to go“', 'Mobilität');

    // Jetzt sind es zwei Buchungen: 2,50 € und 2,00 €.
    await expect(page.getByText('2 Buchungen', { exact: true })).toBeVisible();
    await expect(page.getByText('2,00', { exact: false }).first()).toBeVisible();

    // Und in der Buchungsliste steht dasselbe.
    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('2 Buchungen', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Einkauf mit 2 Buchungen/).first()).toBeVisible();
    // Der Beleg hat den Umbau überlebt.
    await expect(page.getByText(/1 Beleg/).first()).toBeVisible();
  });

  test('der Betrag einer Bon-Buchung ist nicht von Hand änderbar', async ({ page }) => {
    await einrichten(page);
    await bonBuchen(page);
    await page
      .getByRole('dialog', { name: 'Gebucht' })
      .getByRole('button', { name: 'Fertig' })
      .click();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await page
      .getByRole('button', { name: /Musterbäckerei/ })
      .first()
      .click();

    // Gesperrt, mit dem Weg zum Einkauf daneben — ein Betrag, den die
    // nächste Postenänderung überschreibt, wäre ein unsichtbarer Fehler.
    await expect(page.getByLabel('Betrag')).toHaveAttribute('readonly', '');
    await page.getByRole('link', { name: 'Einkauf ansehen' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Musterbäckerei/ })).toBeVisible();
  });

  test('Löschen nimmt Posten, Buchungen und Beleg mit — nach zwei Schritten', async ({ page }) => {
    await einrichten(page);
    await bonBuchen(page);
    await page
      .getByRole('dialog', { name: 'Gebucht' })
      .getByRole('link', { name: 'Einkauf ansehen' })
      .click();

    // Ein Klick tut nichts außer fragen.
    await page.getByRole('button', { name: 'Einkauf löschen' }).click();
    await expect(page.getByRole('button', { name: 'Ja, alles entfernen' })).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByRole('button', { name: 'Ja, alles entfernen' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Einkauf löschen' }).click();
    await page.getByRole('button', { name: 'Ja, alles entfernen' }).click();

    // Der Einkauf ist weg — die Seite sagt das, statt leer dazustehen.
    await expect(page.getByText('Diesen Einkauf gibt es nicht mehr.')).toBeVisible();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('0 Buchungen')).toBeVisible();
  });
});
