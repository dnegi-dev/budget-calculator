import { expect, test } from '@playwright/test';

/**
 * Ein Durchlauf des Alltagswegs.
 *
 * Geprüft wird nicht, ob Knöpfe existieren, sondern ob am Ende die richtige
 * Zahl dasteht: 400 € Limit minus 12,50 € Ausgabe ergibt 387,50 € — über
 * Wizard, Bottom Sheet, IndexedDB und Restbetragsrechnung hinweg.
 */

test.describe('Haushalt einrichten und buchen', () => {
  test('Ersteinrichtung, Topf, Ausgabe, Beleg, Sicherung', async ({ page }) => {
    await page.goto('/');

    // --- Ersteinrichtung -------------------------------------------------
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();
    await page.getByLabel('Name des Haushalts').fill('Testhaushalt');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: 'Währung und Periode' })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Vorgeschlagene Töpfe: "Lebensmittel" ist voraktiviert und wird abgewählt,
    // damit der eigene Topf im Test eindeutig ist.
    await expect(page.getByRole('heading', { name: /Welche T/ })).toBeVisible();
    await page.getByRole('button', { name: /Lebensmittel/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: /Einkommen/ })).toBeVisible();
    await page.getByRole('button', { name: /Los geht/ }).click();

    // --- Startseite ------------------------------------------------------
    await expect(page.getByRole('button', { name: 'Ausgabe erfassen' })).toBeVisible();

    // --- Topf anlegen ----------------------------------------------------
    await page.getByRole('link', { name: 'Töpfe' }).first().click();
    await page.getByRole('button', { name: '+ Neuer Topf' }).click();

    await page.getByLabel('Wofür ist der Topf?').fill('Lebensmittel');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByRole('radio', { name: /^Monatsbudget/ }).check();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByLabel(/Limit pro Periode/).fill('400');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByRole('button', { name: 'Topf anlegen' }).click();
    await expect(page.getByRole('link', { name: /Lebensmittel/ })).toBeVisible();

    // --- Ausgabe buchen --------------------------------------------------
    await page.getByRole('link', { name: 'Heute' }).first().click();
    await page.getByRole('button', { name: 'Ausgabe erfassen' }).click();

    await page.getByLabel('Betrag').fill('12,50');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByRole('button', { name: /Lebensmittel/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Details: Beleg anhängen. Die Buchung existiert an dieser Stelle schon,
    // denn ein Beleg braucht etwas zu belegen.
    await page.getByLabel('Wo?').fill('Supermarkt');
    await page.setInputFiles('input[type="file"]', {
      name: 'kassenzettel.png',
      mimeType: 'image/png',
      // 1x1-PNG — der Inhalt ist unerheblich, geprüft wird die Ablage.
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await expect(
      page.getByRole('button', { name: /Beleg kassenzettel.png ansehen/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Fertig' }).click();

    // Das Sheet schließt erst, wenn der Schreibvorgang durch ist. Ohne dieses
    // Abwarten bricht das folgende page.reload() die laufende
    // IndexedDB-Transaktion ab — und die Notiz fehlt.
    await expect(page.getByRole('dialog')).toBeHidden();

    // --- Die eigentliche Prüfung ----------------------------------------
    // 400,00 € − 12,50 € = 387,50 €
    await expect(page.getByRole('link', { name: /Lebensmittel/ })).toContainText('387,50');

    // --- Neuladen: die Daten liegen in IndexedDB ------------------------
    await page.reload();
    await expect(page.getByRole('link', { name: /Lebensmittel/ })).toContainText('387,50');

    // --- Auswertung ------------------------------------------------------
    await page.getByRole('link', { name: 'Auswertung' }).first().click();
    await expect(page.getByText('Ausgaben', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('12,50').first()).toBeVisible();

    // --- Buchungsliste zeigt den Beleg ----------------------------------
    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('Supermarkt')).toBeVisible();
    await expect(page.getByText(/1 Beleg/)).toBeVisible();
  });

  /**
   * Der Weg, der ohne Server über Datenverlust entscheidet: sichern, alles
   * löschen, aus der Datei wiederherstellen. Die Wiederherstellung läuft
   * bewusst aus dem Onboarding heraus, weil es danach keinen Nutzer gibt, der
   * das Recht `data.import` haben könnte.
   */
  test('Sicherung, Löschen und Wiederherstellen', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Name des Haushalts').fill('Sicherungstest');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: /Los geht/ }).click();

    await page.getByRole('button', { name: 'Ausgabe erfassen' }).click();
    await page.getByLabel('Betrag').fill('33,33');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('link', { name: 'Einstellungen' }).first().click();

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Als JSON sichern' }).click(),
    ]).then(([event]) => event);
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();

    await page.getByRole('button', { name: 'Daten löschen' }).click();
    await page.getByRole('button', { name: 'Ja, alles löschen' }).click();
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();

    // Wiederherstellen aus der eben erzeugten Datei. Die Anwendung erscheint
    // danach auf der Route, auf der man stand — hier also den Einstellungen.
    await page.setInputFiles('input[type="file"]', backupPath!);
    await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Sicherungstest');

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('33,33').first()).toBeVisible();
  });
});
