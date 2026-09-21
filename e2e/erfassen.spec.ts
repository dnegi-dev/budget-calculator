import { expect, test } from '@playwright/test';
import {
  einrichten,
  einstellungOeffnen,
  entsperren,
  istMobil,
  langDruecken,
  schwebenderKnopf,
} from './helpers';

/**
 * Der schwebende Knopf: Standardaktion, langes Drücken, der zweite Weg über
 * die Tastatur und der Topf aus der Adresse.
 *
 * Alles hier ist mobil — ab `md` gibt es den Knopf nicht, dort tragen die
 * Seiten ihre eigenen. Die Tests überspringen sich am Schreibtisch selbst,
 * statt heimlich etwas anderes zu prüfen.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Schwebender Knopf', () => {
  test('ein Tippen öffnet direkt die Ausgabe', async ({ page }) => {
    test.skip(!istMobil(page), 'Den Knopf gibt es nur mobil.');
    await einrichten(page);

    await expect(schwebenderKnopf(page)).toHaveAttribute(
      'aria-label',
      /^Ausgabe erfassen — lang drücken/,
    );
    await schwebenderKnopf(page).click();

    // Kein Zwischenschritt mehr: Der Betrag steht sofort da, und der
    // Umschalter für die Art fehlt (`lockKind`).
    await expect(page.getByLabel('Betrag')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Einnahme' })).toHaveCount(0);
  });

  test('langes Drücken zeigt beide Arten, Pfeil nach oben auch', async ({ page }) => {
    test.skip(!istMobil(page), 'Den Knopf gibt es nur mobil.');
    await einrichten(page);

    const knopf = schwebenderKnopf(page);
    await langDruecken(page, knopf);
    await expect(page.getByRole('menuitem', { name: 'Ausgabe' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Einnahme' })).toBeVisible();

    // Wegtippen schließt, ohne zu erfassen.
    await page.getByRole('button', { name: 'Menü schließen' }).click();
    await expect(page.getByRole('menuitem', { name: 'Einnahme' })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    /*
      Der zweite Weg. Langes Drücken ist mit einer Tastatur nicht machbar —
      ohne diese Taste wäre „Einnahme" mobil unerreichbar, und deshalb ist der
      Test hier und nicht bei den freiwilligen Feinheiten.
    */
    await knopf.focus();
    await knopf.press('ArrowUp');
    await page.getByRole('menuitem', { name: 'Einnahme' }).click();

    await expect(page.getByLabel('Betrag')).toBeVisible();
    await page.getByLabel('Betrag').fill('2500');
    await page.getByRole('button', { name: 'Weiter' }).click();
    // Einnahmen überspringen den Topf-Schritt und landen in den Details.
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('+25,00', { exact: false })).toBeVisible();
  });

  test('auf der Topf-Seite ist der Topf vorbelegt', async ({ page }) => {
    test.skip(!istMobil(page), 'Den Knopf gibt es nur mobil.');
    await einrichten(page);

    await page.getByRole('link', { name: /Haushalt/ }).click();
    await expect(page.getByRole('heading', { name: 'Haushalt', level: 1 })).toBeVisible();
    // Der Knopf auf der Seite ist weg — mobil macht das der schwebende.
    await expect(page.getByRole('button', { name: /^Auf „Haushalt/ })).toHaveCount(0);

    await schwebenderKnopf(page).click();
    await page.getByLabel('Betrag').fill('1000');
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Der Topf-Schritt zeigt „Haushalt" als gewählt: Der Knopf hat ihn aus
    // `?pot=` gelesen.
    await expect(page.getByRole('button', { name: /Haushalt/ }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(page.getByText('1 Buchung', { exact: false })).toBeVisible();
  });

  test('die Standardaktion je Seite wirkt nur dort', async ({ page }) => {
    test.skip(!istMobil(page), 'Den Knopf gibt es nur mobil.');
    await einrichten(page);

    await einstellungOeffnen(page, 'Erfassen');
    await page.getByLabel('Knopf auf „Buchungen“').selectOption('income');

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(schwebenderKnopf(page)).toHaveAttribute('aria-label', /^Einnahme erfassen/);

    await page.getByRole('link', { name: 'Heute' }).first().click();
    await expect(schwebenderKnopf(page)).toHaveAttribute('aria-label', /^Ausgabe erfassen/);
  });

  test('„Fragen“ bringt die alte Zwischenfrage zurück', async ({ page }) => {
    test.skip(!istMobil(page), 'Den Knopf gibt es nur mobil.');
    await einrichten(page);

    await einstellungOeffnen(page, 'Erfassen');
    await page
      .getByRole('radiogroup', { name: 'Standardaktion des schwebenden Knopfes' })
      .getByRole('radio', { name: 'Fragen' })
      .click();

    await page.getByRole('link', { name: 'Heute' }).first().click();
    await schwebenderKnopf(page).click();
    const frage = page.getByRole('dialog');
    await expect(page.getByRole('heading', { name: /Was möchtest du erfassen/ })).toBeVisible();
    // Im Sheet, nicht irgendwo: Der schwebende Knopf heißt selbst „Ausgabe
    // erfassen" und liegt weiter im Baum.
    await frage.getByRole('button', { name: 'Ausgabe' }).click();
    await expect(page.getByLabel('Betrag')).toBeVisible();
  });
});
