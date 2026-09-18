import { expect, test } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen } from './helpers';

/**
 * Die zwei Geräte-Einstellungen: Darstellung und Betragseingabe.
 *
 * Beim Thema ist nicht nur wichtig, dass es umschaltet, sondern dass es einen
 * Reload übersteht, ohne dass kurz das falsche Thema zu sehen ist — dafür
 * sorgt das Skript in `app/layout.tsx`, und dafür steht die Prüfung des
 * Attributs direkt nach dem Laden.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Geräte-Einstellungen', () => {
  test('Dunkelmodus schaltet um und übersteht einen Reload', async ({ page }) => {
    await einrichten(page);
    await page.getByRole('link', { name: 'Einstellungen' }).first().click();

    const wurzel = page.locator('html');
    await expect(wurzel).not.toHaveAttribute('data-theme', /.*/);

    await page.getByRole('radio', { name: 'Dunkel' }).click();
    await expect(wurzel).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(wurzel).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('radio', { name: 'Hell' }).click();
    await expect(wurzel).toHaveAttribute('data-theme', 'light');

    // exact: sonst trifft es auch „Komma automatisch“ daneben.
    await page.getByRole('radio', { name: 'Automatisch', exact: true }).click();
    await expect(wurzel).not.toHaveAttribute('data-theme', /.*/);
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

    await page.getByRole('link', { name: 'Einstellungen' }).first().click();
    await page.getByRole('radio', { name: 'Freitext' }).click();

    await page.getByRole('link', { name: 'Heute' }).first().click();
    await erfassenOeffnen(page, 'Ausgabe');
    const frei = page.getByLabel('Betrag');
    await frei.pressSequentially('12,5');
    await expect(frei).toHaveValue('12,5');
  });
});
