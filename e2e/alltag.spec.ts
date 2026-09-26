import { expect, test } from '@playwright/test';
import { einstellungOeffnen, entsperren, erfassenOeffnen, zuDenToepfen } from './helpers';

/**
 * Ein Durchlauf des Alltagswegs.
 *
 * Geprüft wird nicht, ob Knöpfe existieren, sondern ob am Ende die richtige
 * Zahl dasteht: 400 € Limit minus 12,50 € Ausgabe ergibt 387,50 € — über
 * Wizard, Bottom Sheet, IndexedDB und Restbetragsrechnung hinweg.
 *
 * Beträge werden als reine Ziffernfolge eingegeben: Die Voreinstellung ist der
 * Kassenzettel-Modus, in dem die letzten zwei Ziffern Cent sind. `40000` sind
 * also 400,00 € — und `400` wären 4,00 €.
 */

// Die Anmeldung selbst prüft login.spec.ts — hier soll der Alltag geprüft
// werden, nicht jedes Mal dieselbe Tür.
test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Haushalt einrichten und buchen', () => {
  test('Ersteinrichtung, Topf, Ausgabe, Beleg, Sicherung', async ({ page }) => {
    await page.goto('/');

    // --- Ersteinrichtung -------------------------------------------------
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();
    await page.getByLabel('Name des Haushalts').fill('Testhaushalt');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: 'Währung und Periode' })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: /Einkommen/ })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: /Beträge gesetzt/ })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Vorgeschlagener Topf "Lebensmittel" ist voraktiviert und wird
    // abgewählt, damit der eigene Topf weiter unten im Test eindeutig ist.
    await expect(page.getByRole('heading', { name: 'Lebensmittel' })).toBeVisible();
    await page.getByRole('button', { name: 'Diesen Topf anlegen' }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: 'Haushalt' })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: 'Hobby' })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await expect(page.getByRole('heading', { name: 'Urlaub' })).toBeVisible();
    await page.getByRole('button', { name: /Los geht/ }).click();

    // --- Startseite ------------------------------------------------------
    // Die im Wizard gewählten Töpfe stehen jetzt hier.
    await expect(page.getByRole('link', { name: /Haushalt/ })).toBeVisible();

    // --- Topf anlegen ----------------------------------------------------
    // Über die Zeile unter der Liste — der Weg, den es mobil wie auf dem
    // Desktop gibt, seit „Töpfe" nicht mehr in der unteren Leiste steht.
    await page.getByRole('button', { name: 'Neuer Topf' }).click();

    await page.getByLabel('Wofür ist der Topf?').fill('Lebensmittel');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByRole('radio', { name: /^Monatsbudget/ }).check();
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByLabel(/Limit pro Periode/).fill('40000');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByRole('button', { name: 'Topf anlegen' }).click();
    await expect(page.getByRole('link', { name: /Lebensmittel/ })).toBeVisible();

    // --- Ausgabe buchen --------------------------------------------------
    await zuDenToepfen(page);
    // Mobil über den schwebenden Knopf, auf dem Desktop über den Knopf auf der
    // Seite — beides führt in dasselbe Sheet.
    await erfassenOeffnen(page, 'Ausgabe');

    await page.getByLabel('Betrag').fill('1250');
    await page.getByRole('button', { name: 'Weiter' }).click();

    await page.getByRole('button', { name: /Lebensmittel/ }).click();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Details: Beleg anhängen. Die Buchung existiert an dieser Stelle schon,
    // denn ein Beleg braucht etwas zu belegen.
    // „Firma" ist der Name; „Wo?" trägt seit der Trennung die Anschrift.
    await page.getByLabel('Firma').fill('Supermarkt');
    // Das Feld ohne `capture` — der Kamera-Knopf hat ein eigenes, und ein
    // unspezifisches input[type=file] träfe beide.
    const belegFeld = 'input[type="file"][accept="image/*,application/pdf"]';
    await page.setInputFiles(belegFeld, {
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

    // Eine PDF-Rechnung muss denselben Weg gehen — das war vorher unmöglich,
    // weil `capture` das Telefon in die Kamera zwang.
    await page.setInputFiles(belegFeld, {
      name: 'rechnung.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF\n', 'utf8'),
    });
    await expect(page.getByRole('button', { name: /Beleg rechnung.pdf ansehen/ })).toBeVisible();

    // Alles andere wird mit Begründung abgelehnt, nicht still verschluckt.
    await page.setInputFiles(belegFeld, {
      name: 'notizen.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('kein Beleg', 'utf8'),
    });
    await expect(page.getByText(/notizen.txt.*kein Bild und kein PDF/)).toBeVisible();
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
    // Zwei: das Foto und die PDF-Rechnung. Die Textdatei wurde abgelehnt.
    await expect(page.getByText(/2 Belege/)).toBeVisible();
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
    await page.getByRole('button', { name: 'Weiter' }).click(); // Name
    await page.getByRole('button', { name: 'Weiter' }).click(); // Währung/Periode
    await page.getByRole('button', { name: 'Weiter' }).click(); // Einkommen, leer
    await page.getByRole('button', { name: 'Weiter' }).click(); // Betragsart, „Frei"
    await page.getByRole('button', { name: 'Weiter' }).click(); // Lebensmittel, an
    await page.getByRole('button', { name: 'Weiter' }).click(); // Haushalt, an
    await page.getByRole('button', { name: 'Weiter' }).click(); // Hobby, aus
    await page.getByRole('button', { name: /Los geht/ }).click(); // Urlaub, aus

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByLabel('Betrag').fill('3333');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await einstellungOeffnen(page, 'Sicherung');

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Als JSON sichern' }).click(),
    ]).then(([event]) => event);
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();

    await page.getByRole('link', { name: '← Einstellungen' }).click();
    await page.getByRole('link', { name: /^Gefahrenzone/ }).click();
    await page.getByRole('button', { name: 'Daten löschen' }).click();
    await page.getByRole('button', { name: 'Ja, alles löschen' }).click();
    await expect(page.getByRole('heading', { name: /Wie soll dein Haushalt hei/ })).toBeVisible();

    // Wiederherstellen aus der eben erzeugten Datei. Die Anwendung erscheint
    // danach auf der Route, auf der man stand — hier also der Gefahrenzone.
    await page.setInputFiles('input[type="file"]', backupPath!);
    await expect(page.getByRole('heading', { name: 'Gefahrenzone', level: 1 })).toBeVisible();

    await page.getByRole('link', { name: '← Einstellungen' }).click();
    await page.getByRole('link', { name: /^Haushalt/ }).click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Sicherungstest');

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('33,33').first()).toBeVisible();
  });
});
