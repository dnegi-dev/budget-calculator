import { expect, test, type Page } from '@playwright/test';
import { einrichten, einstellungOeffnen, entsperren, erfassenOeffnen, wischen } from './helpers';

/**
 * Buchungen löschen — Geste und Knopf.
 *
 * Vor dieser Runde gab es gar keinen Weg: `deleteEntry` stand im Repository
 * und wurde von der Oberfläche nie gerufen. Geprüft wird deshalb beides, und
 * zusätzlich die zwei Fälle, in denen **nicht** gelöscht werden darf: bei
 * abgeschalteter Geste und bei einer Buchung aus einem Bon.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

async function ausgabeErfassen(page: Page, betrag: string) {
  await erfassenOeffnen(page, 'Ausgabe');
  await page.getByLabel('Betrag').fill(betrag);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: /Wohnen/ }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

/** Die erste Zeile der Buchungsliste. */
function ersteZeile(page: Page) {
  return page.locator('li > button[type="button"]').first();
}

async function zuBuchungen(page: Page) {
  await page.getByRole('link', { name: 'Buchungen' }).first().click();
  await expect(page.getByRole('heading', { name: 'Buchungen', level: 1 })).toBeVisible();
}

test.describe('Löschen', () => {
  test('Wischen fragt nach und löscht dann', async ({ page }) => {
    await einrichten(page);
    await ausgabeErfassen(page, '1000');
    await ausgabeErfassen(page, '2000');
    await zuBuchungen(page);
    await expect(page.getByText('2 Buchungen')).toBeVisible();

    await wischen(page, ersteZeile(page));

    // Die Rückfrage ist voreingestellt — es gibt kein Rückgängig.
    const frage = page.getByRole('dialog', { name: 'Buchung löschen?' });
    await expect(frage).toBeVisible();

    // Abbrechen lässt die Buchung stehen.
    await frage.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByText('2 Buchungen')).toBeVisible();

    await wischen(page, ersteZeile(page));
    await page.getByRole('button', { name: 'Ja, löschen' }).click();
    await expect(page.getByText('1 Buchung', { exact: true })).toBeVisible();
  });

  test('ohne Rückfrage löscht das Wischen sofort', async ({ page }) => {
    await einrichten(page);
    await ausgabeErfassen(page, '1000');
    await ausgabeErfassen(page, '2000');

    await einstellungOeffnen(page, 'Erfassen');
    await page.getByLabel('Vorher nachfragen').uncheck();

    await zuBuchungen(page);
    await wischen(page, ersteZeile(page));
    await expect(page.getByText('1 Buchung', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Buchung löschen?' })).toHaveCount(0);
  });

  test('abgeschaltet tut das Wischen nichts — auch nicht öffnen', async ({ page }) => {
    await einrichten(page);
    await ausgabeErfassen(page, '1000');

    await einstellungOeffnen(page, 'Erfassen');
    await page.getByLabel('Wischen löscht eine Buchung').uncheck();

    await zuBuchungen(page);
    await wischen(page, ersteZeile(page));
    await expect(page.getByText('1 Buchung', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Buchung löschen?' })).toHaveCount(0);
  });

  test('der Löschknopf in der Buchung ist der zweite Weg', async ({ page }) => {
    await einrichten(page);
    await ausgabeErfassen(page, '1000');
    await zuBuchungen(page);

    await ersteZeile(page).click();
    /*
      Ohne „Weiter": Der Knopf steht im ersten Schritt, denn dort landet man
      beim Öffnen einer bestehenden Buchung. Lag er bei den Details, wären es
      zwei Klicks bis zum Löschen — für den Weg, der die Geste für Tastatur
      und Screenreader ersetzt, zu weit.
    */
    await expect(page.getByRole('button', { name: 'Buchung löschen' })).toBeVisible();
    // Zweistufig: Der erste Klick fragt nur.
    await page.getByRole('button', { name: 'Buchung löschen' }).click();
    await expect(page.getByRole('button', { name: 'Ja, entfernen' })).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByRole('button', { name: 'Ja, entfernen' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Buchung löschen' }).click();
    await page.getByRole('button', { name: 'Ja, entfernen' }).click();
    await expect(page.getByText('0 Buchungen')).toBeVisible();
  });

  test('ohne Löschknopf bleibt nur das Wischen', async ({ page }) => {
    await einrichten(page);
    await ausgabeErfassen(page, '1000');

    await einstellungOeffnen(page, 'Erfassen');
    await page.getByLabel('Löschknopf in der Buchung').uncheck();

    await zuBuchungen(page);
    await ersteZeile(page).click();
    await expect(page.getByRole('button', { name: 'Buchung löschen' })).toHaveCount(0);
  });

  /**
   * Der Fall, der still Daten zerstören würde: Der Betrag einer Bon-Buchung
   * ist die Summe der Posten ihres Topfes, und an einer Buchung der Gruppe
   * hängt der Beleg.
   */
  test('eine Buchung aus einem Bon lässt sich nicht einzeln löschen', async ({ page }) => {
    await einrichten(page);

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByRole('button', { name: /Aus PDF-Bon einlesen/ }).click();
    await page.setInputFiles(
      'input[type="file"][accept="application/pdf"]',
      'e2e/fixtures/bon-ekabs.pdf',
    );
    await expect(page.getByText('Aus dem Beleg selbst gelesen.')).toBeVisible();
    await page.getByRole('button', { name: 'Buchung anlegen' }).click();
    await page
      .getByRole('dialog', { name: 'Gebucht' })
      .getByRole('button', { name: 'Fertig' })
      .click();

    await zuBuchungen(page);
    const vorher = await page
      .getByText(/\d+ Buchung/)
      .first()
      .textContent();

    /*
      Wischen läuft ins Leere — keine Rückfrage, nichts gelöscht.

      Was danach offen sein *darf*, ist die Buchung selbst: Ohne Geste bleibt
      die waagerechte Mausbewegung ein Klick auf die Zeile, und der öffnet
      sie. Das ist das Verhalten von vor dieser Runde und kein Fehler.
    */
    await wischen(page, ersteZeile(page));
    await expect(page.getByRole('dialog', { name: 'Buchung löschen?' })).toHaveCount(0);
    await expect(page.getByText(/\d+ Buchung/).first()).toHaveText(vorher ?? '');

    // Im Sheet steht der Weg über den Einkauf statt eines Knopfes.
    const sheet = page.getByRole('dialog', { name: 'Buchung bearbeiten' });
    if ((await sheet.count()) === 0) await ersteZeile(page).click();
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buchung löschen' })).toHaveCount(0);
    await expect(page.getByText(/über den Einkauf/)).toBeVisible();
    await page.getByRole('link', { name: 'Einkauf ansehen' }).click();
    await expect(page.getByRole('button', { name: 'Einkauf löschen' })).toBeVisible();
  });
});
