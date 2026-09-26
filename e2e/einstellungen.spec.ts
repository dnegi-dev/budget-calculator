import { expect, test } from '@playwright/test';
import {
  einrichten,
  einstellungOeffnen,
  entsperren,
  erfassenOeffnen,
  zuDenToepfen,
} from './helpers';

/**
 * Die Einstellungen als Übersicht mit Unterseiten.
 *
 * Zwei Dinge sind hier wichtiger als das Aussehen: dass jeder Punkt wirklich
 * eine eigene Route hat und der Weg zurück führt, und dass in der Gefahrenzone
 * nichts mit einem Klick passiert.
 */

const PUNKTE = [
  'Haushalt',
  'Erfassen',
  'Darstellung',
  'Ordnen',
  'Sicherung',
  'Nutzer und Rollen',
  'Gefahrenzone',
] as const;

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Einstellungen', () => {
  test('führt auf jede Unterseite und wieder zurück', async ({ page }) => {
    await einrichten(page);
    await page.getByRole('link', { name: 'Einstellungen' }).first().click();

    for (const punkt of PUNKTE) {
      await page.getByRole('link', { name: new RegExp(`^${punkt}`) }).click();
      await expect(page.getByRole('heading', { name: punkt, level: 1 })).toBeVisible();
      await page.getByRole('link', { name: '← Einstellungen' }).click();
      await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
    }
  });

  test('Dunkelmodus schaltet um und übersteht einen Reload', async ({ page }) => {
    await einrichten(page);
    await einstellungOeffnen(page, 'Darstellung');

    // `data-mode` ist der aufgelöste Modus: Bei „Automatisch“ steht dort, was
    // das System sagt — im Testlauf hell.
    const wurzel = page.locator('html');
    await expect(wurzel).toHaveAttribute('data-mode', 'light');

    await page.getByRole('radio', { name: 'Dunkel' }).click();
    await expect(wurzel).toHaveAttribute('data-mode', 'dark');

    await page.reload();
    await expect(wurzel).toHaveAttribute('data-mode', 'dark');

    await page.getByRole('radio', { name: 'Hell' }).click();
    await expect(wurzel).toHaveAttribute('data-mode', 'light');

    // exact: sonst trifft es auch „Komma automatisch“ auf anderen Seiten.
    await page.getByRole('radio', { name: 'Automatisch', exact: true }).click();
    await expect(wurzel).toHaveAttribute('data-mode', 'light');
  });

  test('Kassenzettel-Modus setzt das Komma, Freitext nicht', async ({ page }) => {
    await einrichten(page);

    await erfassenOeffnen(page, 'Ausgabe');
    const betrag = page.getByLabel('Betrag');
    await betrag.pressSequentially('1250');
    await expect(betrag).toHaveValue('12,50');
    // Rücktaste bleibt gültig: aus 12,50 wird 1,25.
    await betrag.press('Backspace');
    await expect(betrag).toHaveValue('1,25');
    await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await einstellungOeffnen(page, 'Erfassen');
    await page.getByRole('radio', { name: 'Freitext' }).click();

    await zuDenToepfen(page);
    await erfassenOeffnen(page, 'Ausgabe');
    const frei = page.getByLabel('Betrag');
    await frei.pressSequentially('12,5');
    await expect(frei).toHaveValue('12,5');
  });

  test('Gefahrenzone löscht erst nach der zweiten Frage', async ({ page }) => {
    await einrichten(page);
    await einstellungOeffnen(page, 'Gefahrenzone');

    // Ein Klick tut nichts außer fragen.
    await page.getByRole('button', { name: 'Daten löschen' }).click();
    await expect(page.getByRole('button', { name: 'Ja, alles löschen' })).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByRole('button', { name: 'Ja, alles löschen' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Daten löschen' }).click();
    await page.getByRole('button', { name: 'Ja, alles löschen' }).click();

    // Ohne Haushalt steht wieder die Ersteinrichtung da.
    await expect(page.getByLabel('Name des Haushalts')).toBeVisible();
  });
});
