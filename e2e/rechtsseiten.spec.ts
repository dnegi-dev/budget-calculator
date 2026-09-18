import { expect, test } from '@playwright/test';
import { entsperren } from './helpers';

/**
 * Impressum und Datenschutz müssen erreichbar sein, **bevor** ein Haushalt
 * eingerichtet ist — sonst führt der Link aus dem Onboarding oder aus einer
 * Suchmaschine in den Wizard statt auf die Seite. Genau das prüft dieser Test:
 * frischer Browser, kein Haushalt, direkter Aufruf.
 */

test.describe('Rechtsseiten', () => {
  test('sind ohne eingerichteten Haushalt erreichbar', async ({ page }) => {
    await page.goto('/impressum/');
    await expect(page.getByRole('heading', { name: 'Impressum', level: 1 })).toBeVisible();
    // Solange Platzhalter drinstehen, muss der Warnhinweis sichtbar sein.
    await expect(page.getByText('Diese Seite ist noch eine Vorlage.')).toBeVisible();

    await page.goto('/datenschutz/');
    await expect(
      page.getByRole('heading', { name: 'Datenschutzerklärung', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/ausschließlich im Speicher deines Browsers/)).toBeVisible();
  });

  test('sind aus dem Onboarding heraus verlinkt', async ({ page }) => {
    await entsperren(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();

    await page.getByRole('link', { name: 'Impressum' }).click();
    await expect(page.getByRole('heading', { name: 'Impressum', level: 1 })).toBeVisible();

    // Zurück in die App — dort steht wieder der Wizard, nichts ist verloren.
    await page.getByRole('link', { name: /Zur App/ }).click();
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();
  });

  test('sind aus der eingerichteten App heraus verlinkt', async ({ page }) => {
    await entsperren(page);
    await page.goto('/');
    await page.getByLabel('Name des Haushalts').fill('Rechtstest');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Los geht/ }).click();
    await expect(page.getByRole('button', { name: 'Vorige Periode' })).toBeVisible();

    await page.getByRole('link', { name: 'Datenschutz' }).first().click();
    await expect(
      page.getByRole('heading', { name: 'Datenschutzerklärung', level: 1 }),
    ).toBeVisible();
  });
});
