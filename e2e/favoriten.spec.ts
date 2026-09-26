import { expect, test, type Page } from '@playwright/test';
import {
  einrichten,
  einstellungOeffnen,
  entsperren,
  istMobil,
  optionWaehlen,
  zuDenToepfen,
} from './helpers';

/**
 * Lieblings-Töpfe im Menü: mobil einer in der unteren Leiste, am Desktop bis
 * zu vier in der Seitenleiste. Eingestellt unter Einstellungen → Töpfe.
 *
 * Dazu der Fall, den AGENTS.md für jeden fünften Eintrag der unteren Leiste
 * verlangt: 320 px Breite, nichts läuft über.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

function hauptnavigation(page: Page) {
  return page.getByRole('navigation', { name: 'Hauptnavigation' });
}

async function kategorieTopf(page: Page, name: string): Promise<void> {
  await zuDenToepfen(page);
  await page.getByRole('button', { name: 'Neuer Topf' }).click();
  await page.getByLabel('Wofür ist der Topf?').fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: /^Nur Kategorie/ }).check();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Topf anlegen' }).click();
  await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
}

test.describe('Lieblings-Töpfe im Menü', () => {
  test('mobil: ein Topf in der unteren Leiste, auch bei 320 px', async ({ page }) => {
    test.skip(!istMobil(page), 'Die untere Leiste gibt es nur mobil.');
    await einrichten(page);

    // Ohne Favorit: vier Einträge.
    await expect(hauptnavigation(page).getByRole('link')).toHaveCount(4);

    await einstellungOeffnen(page, 'Töpfe');
    await optionWaehlen(page, 'Mobil — in der unteren Leiste', 'Haushalt');

    const favorit = hauptnavigation(page).getByRole('link', { name: 'Haushalt' });
    await expect(favorit).toBeVisible();
    await expect(hauptnavigation(page).getByRole('link')).toHaveCount(5);

    await favorit.click();
    await expect(page.getByRole('heading', { name: 'Haushalt', level: 1 })).toBeVisible();
    // Markiert ist der Favorit, nicht zusätzlich „Töpfe".
    await expect(favorit).toHaveAttribute('aria-current', 'page');
    await expect(
      hauptnavigation(page).getByRole('link', { name: 'Töpfe', exact: true }),
    ).not.toHaveAttribute('aria-current', 'page');

    await page.setViewportSize({ width: 320, height: 700 });
    const leiste = page.locator('nav[aria-label="Hauptnavigation"]:visible');
    const passt = await leiste.evaluate((nav) => nav.scrollWidth <= nav.clientWidth);
    expect(passt).toBe(true);
    for (const link of await hauptnavigation(page).getByRole('link').all()) {
      await expect(link).toBeInViewport();
    }
  });

  test('ein archivierter Topf verschwindet aus dem Menü', async ({ page }) => {
    await einrichten(page);
    await einstellungOeffnen(page, 'Töpfe');
    if (istMobil(page)) {
      await optionWaehlen(page, 'Mobil — in der unteren Leiste', 'Haushalt');
    } else {
      await page.getByRole('checkbox', { name: 'Haushalt' }).check();
    }
    const favorit = hauptnavigation(page).getByRole('link', { name: 'Haushalt' });
    await expect(favorit).toBeVisible();

    await favorit.click();
    await page.getByRole('button', { name: 'Einstellungen dieses Topfes' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archivieren' }).click();

    await expect(favorit).toHaveCount(0);
  });

  test('Desktop: bis zu vier Töpfe in der Seitenleiste', async ({ page }) => {
    test.skip(istMobil(page), 'Die Seitenleiste gibt es nur ab md.');
    await einrichten(page);
    for (const name of ['Garten', 'Kino', 'Sport']) await kategorieTopf(page, name);

    await einstellungOeffnen(page, 'Töpfe');
    for (const name of ['Lebensmittel', 'Haushalt', 'Garten', 'Kino']) {
      await page.getByRole('checkbox', { name }).check();
    }
    // Der fünfte ist ausgegraut, und der Grund steht daneben.
    await expect(page.getByRole('checkbox', { name: 'Sport' })).toBeDisabled();
    await expect(page.getByText(/Höchstens 4/)).toBeVisible();

    for (const name of ['Lebensmittel', 'Haushalt', 'Garten', 'Kino']) {
      await expect(hauptnavigation(page).getByRole('link', { name })).toBeVisible();
    }
    await expect(hauptnavigation(page).getByRole('link', { name: 'Sport' })).toHaveCount(0);

    // Einen herausnehmen gibt den Platz frei.
    await page.getByRole('checkbox', { name: 'Kino' }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Sport' })).toBeEnabled();
  });
});

test.describe('Startseite', () => {
  test('„Heute" gibt es nicht mehr, /toepfe führt auf die Startseite', async ({ page }) => {
    await einrichten(page);
    await expect(hauptnavigation(page).getByRole('link', { name: 'Heute' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Töpfe', level: 1 })).toBeVisible();

    await page.goto('/toepfe/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Töpfe', level: 1 })).toBeVisible();
  });
});
