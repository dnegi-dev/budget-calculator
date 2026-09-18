import { expect, test } from '@playwright/test';
import { entsperren } from './helpers';

/**
 * Das Anmeldefenster ist ausdrücklich **kein** Zugriffsschutz — die Seite wird
 * öffentlich ausgeliefert und die Zugangsdaten stehen im Quelltext. Geprüft
 * wird deshalb nur, was es leisten soll: Es hält die App zurück, es lässt mit
 * den richtigen Daten durch, es merkt sich das, und es steht den Rechtsseiten
 * nicht im Weg.
 */

test.describe('Anmeldung', () => {
  test('hält die App zurück und lässt mit admin/admin durch', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Haushalt', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Passwort')).toBeVisible();
    // Die Ersteinrichtung darf erst danach kommen.
    await expect(page.getByLabel('Name des Haushalts')).toHaveCount(0);

    await page.getByLabel('Benutzername').fill('admin');
    await page.getByLabel('Passwort').fill('falsch');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.getByText('Benutzername oder Passwort stimmt nicht.')).toBeVisible();

    await page.getByLabel('Passwort').fill('admin');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();
  });

  test('bleibt über einen Reload hinweg angemeldet', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Benutzername').fill('admin');
    await page.getByLabel('Passwort').fill('admin');
    await page.getByRole('button', { name: 'Anmelden' }).click();
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();
  });

  test('sagt auf der Anmeldeseite, dass sie kein Schutz ist', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/kein.{0,3} Zugriffsschutz/i)).toBeVisible();
  });

  test('steht dem Impressum nicht im Weg', async ({ page }) => {
    // Ohne Anmeldung: Ein Impressum hinter einer Hürde erfüllt seinen Zweck nicht.
    await page.goto('/impressum/');
    await expect(page.getByRole('heading', { name: 'Impressum', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Passwort')).toHaveCount(0);

    await page.goto('/datenschutz/');
    await expect(
      page.getByRole('heading', { name: 'Datenschutzerklärung', level: 1 }),
    ).toBeVisible();
  });

  test('Abmelden führt zurück zur Anmeldung', async ({ page }) => {
    await entsperren(page);
    await page.goto('/');
    await page.getByLabel('Name des Haushalts').fill('Abmeldetest');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Los geht/ }).click();

    await page.getByRole('link', { name: 'Einstellungen' }).first().click();
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
  });
});
