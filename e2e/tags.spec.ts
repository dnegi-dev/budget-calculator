import { expect, test } from '@playwright/test';
import {
  einrichten,
  einstellungOeffnen,
  entsperren,
  erfassenOeffnen,
  filterOeffnen,
  optionWaehlen,
  zuDenToepfen,
} from './helpers';

/**
 * Standardtopf und Tags — zwei Einstellungen, die den Erfassen-Fluss ändern.
 *
 * Beides ist nur im Zusammenspiel prüfbar: Die Einstellung steht am Haushalt,
 * das Auffangnetz sitzt im Repository, und ob der Topf-Schritt entfällt,
 * entscheidet die Oberfläche. Ein Unit-Test sieht jeweils nur ein Drittel
 * davon.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Standardtopf', () => {
  test('bucht ohne Topf-Schritt in den Standardtopf', async ({ page }) => {
    await einrichten(page);

    await einstellungOeffnen(page, 'Erfassen');
    await optionWaehlen(page, 'Standardtopf', 'Haushalt');
    await page.getByRole('radio', { name: 'Direkt in den Standardtopf' }).click();
    await expect(page.getByText(/Der Schritt entfällt/)).toBeVisible();

    await zuDenToepfen(page);
    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('1250');
    // Der Hinweis steht schon im Betrag-Schritt: Ein stumm gesetzter Topf wäre
    // beim Auswerten eine Überraschung.
    await expect(page.getByText(/Wird auf „Haushalt“ gebucht/)).toBeVisible();

    // „Weiter" führt direkt in die Details — der Topf-Schritt fehlt.
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByLabel('Wo?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Topf ändern' })).toBeVisible();
    await page.getByRole('button', { name: 'Fertig' }).click();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    // Nicht `getByText`: „Haushalt" steht auf dem Schreibtisch zusätzlich —
    // ausgeblendet, aber im Baum — als Beschriftung der Seitenleiste
    // (`AppShell.tsx`). Die Buchungszeile ist dagegen eindeutig ein Knopf.
    await expect(page.getByRole('button', { name: /Haushalt/ }).first()).toBeVisible();
    await expect(page.getByText('12,50', { exact: false }).first()).toBeVisible();
  });

  test('fängt eine Ausgabe auf, bei der „Kein Topf“ gewählt wurde', async ({ page }) => {
    await einrichten(page);

    await einstellungOeffnen(page, 'Erfassen');
    await optionWaehlen(page, 'Standardtopf', 'Haushalt');

    await zuDenToepfen(page);
    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('700');
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Topf-Schritt bleibt, weil „Abfragen" gilt — hier ausdrücklich „Kein
    // Topf". Das Auffangnetz im Repository greift trotzdem: Es unterscheidet
    // nicht, wie die Buchung ohne Topf zustande kam.
    await page.getByRole('button', { name: 'Kein Topf' }).click();
    await page.getByRole('button', { name: 'Speichern' }).click();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    // Auf die Zeile selbst geprüft und nicht auf die Seite: „ohne Topf" steht
    // auch als Filter-Option im Baum, und Playwright sucht Text ohne Rücksicht
    // auf Groß- und Kleinschreibung.
    const zeile = page.getByRole('button', { name: /7,00/ }).first();
    await expect(zeile).toContainText('Haushalt');
    await expect(zeile).not.toContainText('ohne Topf');
  });
});

test.describe('Tags', () => {
  test('erfassen, filtern, auswerten und umbenennen', async ({ page }) => {
    await einrichten(page);

    // --- Einschalten -----------------------------------------------------
    await einstellungOeffnen(page, 'Ordnen');
    await page.getByRole('radiogroup', { name: 'Tags benutzen' }).getByText('An').click();
    await expect(page.getByText(/Noch keine Tags benutzt/)).toBeVisible();

    // --- Buchung mit Tag -------------------------------------------------
    await zuDenToepfen(page);
    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('4000');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Haushalt/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByLabel('Tags', { exact: true }).fill('Urlaub');
    await page.keyboard.press('Enter');
    // Die Marke steht da, bevor gespeichert wird.
    await expect(page.getByRole('button', { name: 'Tag Urlaub entfernen' })).toBeVisible();
    await page.getByRole('button', { name: 'Fertig' }).click();

    // --- Zweite Buchung ohne Tag, über den Vorschlag getaggt -------------
    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('1000');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Haushalt/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    // Vorschlag aus der ersten Buchung — so entstehen „Urlaub" und „urlaub"
    // gar nicht erst als zwei Tags.
    await page.getByRole('button', { name: '+ Urlaub' }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();

    // --- Liste und Filter ------------------------------------------------
    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('#Urlaub', { exact: false }).first()).toBeVisible();

    await filterOeffnen(page);
    await page.getByLabel('Tag').first().selectOption('Urlaub');
    await expect(page.getByText('2 Buchungen', { exact: false }).first()).toBeVisible();
    await page.getByLabel('Tag').first().selectOption('none');
    await expect(page.getByText('0 Buchungen', { exact: false }).first()).toBeVisible();

    // --- Auswertung ------------------------------------------------------
    await page.getByRole('link', { name: 'Auswertung' }).first().click();
    await expect(page.getByRole('heading', { name: 'Nach Tag' })).toBeVisible();
    await expect(page.getByText('50,00', { exact: false }).first()).toBeVisible();
    // Der Satz gehört dazu: Sonst sind die Zahlen bei mehreren Tags nicht
    // erklärbar.
    await expect(page.getByText(/ergeben zusammen mehr als die Ausgaben/)).toBeVisible();

    // --- Umbenennen ------------------------------------------------------
    await einstellungOeffnen(page, 'Ordnen');
    // In der Zeile des Tags bleiben: „Speichern" heißt auch der Knopf der
    // Haushalt-Karte, und der steht weiter oben im Baum.
    const tagZeile = page.getByRole('listitem').filter({ hasText: 'Urlaub' }).first();
    await expect(tagZeile).toContainText('2 Buchungen');
    await tagZeile.getByRole('button', { name: 'Umbenennen' }).click();
    await tagZeile.getByLabel('Neuer Name für „Urlaub“').fill('Norwegen');
    await tagZeile.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Norwegen' })).toHaveCount(1);

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('#Norwegen', { exact: false }).first()).toBeVisible();
  });

  test('zeigt keine Tag-Felder, solange Tags aus sind', async ({ page }) => {
    await einrichten(page);

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('500');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Haushalt/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Aus heißt aus: kein Feld, kein Filter, keine Karte in der Auswertung.
    await expect(page.getByLabel('Tags', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Fertig' }).click();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByLabel('Tag')).toHaveCount(0);
    await page.getByRole('link', { name: 'Auswertung' }).first().click();
    await expect(page.getByRole('heading', { name: 'Nach Tag' })).toHaveCount(0);
  });
});
