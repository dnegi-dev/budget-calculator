import { expect, test, type Page } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen } from './helpers';

/**
 * Der Sparziel-Topf: Betrag und Frist statt Perioden-Limit, Fortschritt über
 * die gesamte Lebenszeit des Topfes statt je Periode.
 *
 * Gebucht wird wie auf jeden anderen Topf — als Ausgabe: Der Topf-Schritt
 * beim Erfassen erscheint nur dort, eine Einnahme ließe sich gar nicht
 * gezielt zuordnen (`EntrySheet.potStepActive`). Eine Ausgabe auf einem
 * Sparziel ist deshalb die Einzahlung, keine Belastung.
 *
 * Die Sperre nach Ablauf der Frist prüft kein E2E-Test — dafür müsste die
 * Zeit vorgespult werden. Das ist gegen `lockDueGoalPots` und die
 * Schreibsperre in `lib/data/local/dexie-repository.test.ts` abgedeckt.
 */

async function sparzielAnlegen(page: Page, name: string) {
  await page.getByRole('button', { name: 'Neuer Topf' }).click();
  await page.getByLabel('Wofür ist der Topf?').fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();

  await page.getByRole('radio', { name: /^Sparziel/ }).check();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await page.getByLabel(/Sparziel-Betrag/).fill('120000'); // 1.200,00 € im Kassenzettel-Modus
  await page.getByLabel('Bis wann?').fill('2099-06-15');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Ziel: 1.200,00 € bis')).toBeVisible();

  await page.getByRole('button', { name: 'Topf anlegen' }).click();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Sparziel-Topf', () => {
  test('lässt sich anlegen und zeigt den Fortschritt statt einer Periode', async ({ page }) => {
    await einrichten(page);
    await sparzielAnlegen(page, 'Urlaub');

    await page
      .getByRole('link', { name: /Urlaub/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Urlaub', level: 1 })).toBeVisible();
    await expect(page.getByText('Gespart')).toBeVisible();
    // `dt`/`dd`-Paare statt `getByText`: „1.200,00 €“ steht auch im Satz
    // „Ziel: 1.200,00 € bis …“ direkt darüber — ein zweideutiger Treffer.
    const zielDd = page
      .locator('dt', { hasText: 'Ziel' })
      .locator('xpath=following-sibling::dd[1]');
    await expect(zielDd).toHaveText('1.200,00 €');
    const offenDd = page
      .locator('dt', { hasText: 'Noch offen' })
      .locator('xpath=following-sibling::dd[1]');
    await expect(offenDd).toHaveText('1.200,00 €'); // noch nichts gespart
  });

  test('eine Ausgabe auf dem Sparziel erhöht das Gesparte', async ({ page }) => {
    await einrichten(page);
    await sparzielAnlegen(page, 'Urlaub');

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('20000');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Urlaub/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page
      .getByRole('link', { name: /Urlaub/ })
      .first()
      .click();
    await expect(page.getByText('200,00 €').first()).toBeVisible();
  });

  test('die Topf-Einstellungen zeigen Sparziel-Felder statt der Übertrag-Checkbox', async ({
    page,
  }) => {
    await einrichten(page);
    await sparzielAnlegen(page, 'Urlaub');

    await page
      .getByRole('link', { name: /Urlaub/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Einstellungen dieses Topfes' }).click();
    const sheet = page.getByRole('dialog', { name: /Urlaub/ });

    await expect(sheet.getByLabel('Sparziel-Betrag')).toHaveValue('1200,00');
    await expect(sheet.getByLabel('Bis wann?')).toHaveValue('2099-06-15');
    await expect(sheet.getByText('Restbetrag übertragen')).toHaveCount(0);
  });
});
