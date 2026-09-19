import { expect, test } from '@playwright/test';
import { einrichten, einstellungOeffnen, entsperren } from './helpers';

/**
 * Topf-Einstellungen in der Leiste und als eigenes Untermenü.
 *
 * Sie lagen vorher als Karte **unter** der Buchungsliste: Um ein Limit zu
 * ändern, musste man an allen Buchungen des Topfes vorbeiscrollen. Jetzt
 * hängen sie am Zahnrad in der Leiste, die ohnehin klebt.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Topf-Einstellungen', () => {
  test('das Zahnrad in der Leiste öffnet sie, samt Regeln dieses Topfes', async ({ page }) => {
    await einrichten(page);
    await page
      .getByRole('link', { name: /Wohnen/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Wohnen', level: 1 })).toBeVisible();

    // Nicht mehr im Seitenfluss: Es gibt keine Karte „Einstellungen" mehr.
    await expect(page.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Einstellungen dieses Topfes' }).click();
    const sheet = page.getByRole('dialog', { name: /Wohnen/ });
    await expect(sheet).toBeVisible();

    // Was vorher in der Karte stand, steht jetzt hier — plus die Regeln.
    await expect(sheet.getByRole('button', { name: 'Archivieren' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Topf löschen' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: '+ Regel' })).toBeVisible();
  });

  test('eine Regel aus dem Topf heraus ist auf diesen Topf vorbelegt', async ({ page }) => {
    await einrichten(page);
    await page
      .getByRole('link', { name: /Wohnen/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Einstellungen dieses Topfes' }).click();
    await page.getByRole('button', { name: '+ Regel' }).click();

    /*
      Nach dem Topf zu fragen, den man gerade offen hat, wäre eine Frage
      ohne Antwortmöglichkeit — deshalb steht er schon da.
    */
    // `exact`, sonst trifft der Name auch das Zahnrad („Einstellungen dieses
    // Topfes") — `getByLabel` sucht standardmäßig nach Teilzeichenketten.
    const topfFeld = page.getByLabel('Topf', { exact: true });
    await expect(topfFeld).not.toHaveValue('');
    const gewaehlt = await topfFeld.locator('option:checked').textContent();
    expect(gewaehlt).toContain('Wohnen');
  });

  test('Töpfe sind ein eigener Punkt in den Einstellungen', async ({ page }) => {
    await einrichten(page);
    await page.getByRole('link', { name: 'Einstellungen' }).first().click();

    /*
      Nicht über `einstellungOeffnen`: Der Helfer sucht den Namen am Anfang,
      und ab `md` heißt der Eintrag in der Seitenleiste ebenfalls „Töpfe" —
      zwei Treffer, und welcher gewinnt, entscheidet der Zufall. Die
      Unterzeile gehört zum Namen der Zeile und ist eindeutig.
    */
    await page.getByRole('link', { name: /Anlegen, umbenennen/ }).click();
    await expect(page.getByRole('heading', { name: 'Töpfe', level: 1 })).toBeVisible();

    // Jede Zeile führt in die Einstellungen des Topfes, nicht in den Alltag.
    await page
      .getByRole('link', { name: /Wohnen/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Wohnen', level: 1 })).toBeVisible();
  });

  test('„Ordnen" verweist nicht mehr auf die Töpfe', async ({ page }) => {
    await einrichten(page);
    await einstellungOeffnen(page, 'Ordnen');
    await expect(page.getByRole('link', { name: /Töpfe verwalten/ })).toHaveCount(0);
  });
});
