import { expect, test } from '@playwright/test';
import {
  einrichten,
  entsperren,
  erfassenOeffnen,
  optionWaehlen,
  einstellungOeffnen,
} from './helpers';

/**
 * Der Bon-Import von der Datei bis zu den Buchungen.
 *
 * Das ist der einzige Test, der pdf.js wirklich im Browser lädt — samt dem
 * Worker aus `public/vendor/`. Läuft er, ist auch der Pfad zum Worker richtig;
 * die Unit-Tests können das nicht prüfen, weil sie in Node ohne `public/`
 * arbeiten.
 */

/**
 * Meldungen, die nichts über die App sagen.
 *
 * Bewusst kurz gehalten: Jeder Eintrag hier ist ein Loch im Wächter. Kommt
 * eine neue Meldung dazu, ist erst zu prüfen, ob sie harmlos ist — nicht sie
 * zuerst wegzufiltern.
 */
const HARMLOS = [/React DevTools/i, /favicon/i];

/**
 * Konsolenfehler sind hier ein Testfehler — und das ist der Kern.
 *
 * Der Fehler, der diesen Wächter nötig gemacht hat, war **still**: Das
 * Standard-Bundle von pdf.js 6 rief `Map.prototype.getOrInsertComputed`, der
 * XRef-Cache warf, pdf.js fiel auf „Indexing all PDF objects" zurück — und die
 * handgebauten Muster kamen trotzdem durch. Ein echter Bon nicht. Kein
 * `expect` konnte das sehen, in der Konsole stand es die ganze Zeit.
 *
 * Nur der E2E-Lauf lädt pdf.js wirklich im Browser; im Unit-Test wäre dieser
 * Wächter an der falschen Stelle.
 */
let konsole: string[] = [];

test.beforeEach(async ({ page }) => {
  konsole = [];
  const merken = (text: string) => {
    if (!HARMLOS.some((muster) => muster.test(text))) konsole.push(text);
  };
  page.on('console', (nachricht) => {
    if (nachricht.type() === 'error') merken(nachricht.text());
  });
  page.on('pageerror', (fehler) => merken(fehler.message));

  await entsperren(page);
});

test.afterEach(() => {
  expect(konsole, `Fehler in der Browser-Konsole:\n${konsole.join('\n')}`).toEqual([]);
});

test.describe('Bon einlesen', () => {
  test('liest ekabs.json, teilt auf zwei Töpfe und lernt die Zuordnung', async ({ page }) => {
    await einrichten(page);

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByRole('button', { name: /Aus PDF-Bon einlesen/ }).click();
    await page.setInputFiles(
      'input[type="file"][accept="application/pdf"]',
      'e2e/fixtures/bon-ekabs.pdf',
    );

    // Vorschau: Summe und Herkunft stehen da, bevor etwas gebucht wird.
    await expect(page.getByText('Aus dem Beleg selbst gelesen.')).toBeVisible();
    await expect(page.getByText('4,50', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Musterbäckerei Schmidt')).toBeVisible();

    // Erst alles auf einen Topf, dann eine Zeile umhängen.
    await optionWaehlen(page, 'Alles auf einen Topf', 'Lebensmittel');
    await optionWaehlen(page, 'Topf für Kaffee to go', 'Haushalt');

    await page.getByRole('button', { name: '2 Buchungen anlegen' }).click();

    // Nach dem Buchen bleibt das Sheet mit dem Weg zum Einkauf stehen.
    const gebucht = page.getByRole('dialog', { name: 'Gebucht' });
    await expect(gebucht).toBeVisible();
    await expect(gebucht.getByRole('link', { name: 'Einkauf ansehen' })).toBeVisible();
    await gebucht.getByRole('button', { name: 'Fertig' }).click();

    // Zwei Dialoge waren offen — der Bon lag über dem Erfassen-Sheet. Danach
    // müssen beide weg sein.
    await expect(page.getByRole('dialog', { name: 'Gebucht' })).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Ausgabe erfassen' })).toBeHidden();

    // Zwei Buchungen, als ein Einkauf erkennbar, mit einem Beleg.
    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('2 Buchungen', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Einkauf mit 2 Buchungen/).first()).toBeVisible();
    await expect(page.getByText(/1 Beleg/).first()).toBeVisible();

    // 2,50 € auf Lebensmittel (Brötchen + Pfand − Rabatt), 2,00 € auf Haushalt.
    await expect(page.getByText('2,50', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('2,00', { exact: false }).first()).toBeVisible();

    // Gelernt: Die Zuordnungen stehen in den Einstellungen unter „Ordnen“.
    await einstellungOeffnen(page, 'Ordnen');
    await expect(page.getByText('kaffee to go')).toBeVisible();

    // Und beim zweiten Mal ist die Zeile vorbelegt.
    await page.getByRole('link', { name: 'Heute' }).first().click();
    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByRole('button', { name: /Aus PDF-Bon einlesen/ }).click();
    await page.setInputFiles(
      'input[type="file"][accept="application/pdf"]',
      'e2e/fixtures/bon-ekabs.pdf',
    );
    await expect(page.getByLabel('Topf für Kaffee to go')).toHaveValue(/.+/);
  });

  /**
   * Safari hat `ReadableStream[Symbol.asyncIterator]` nicht — nur Chromium und
   * Firefox können `for await (const x of stream)`. `page.getTextContent()` von
   * pdf.js tut genau das und wirft dort „undefined is not a function", und zwar
   * erst nach dem Laden des Dokuments: Für den Nutzer sah es aus wie ein
   * unlesbares PDF.
   *
   * Der Test nimmt dem Browser diese Methode weg. Das ist die Nachbildung von
   * Safari, die in Chromium läuft — ein WebKit im Testlauf wäre eine zweite
   * Browser-Abhängigkeit für genau eine Zeile.
   */
  test('liest den Bon auch ohne Stream-Iteration am Browser (Safari)', async ({ page }) => {
    await page.addInitScript(() => {
      const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
      delete proto[Symbol.asyncIterator];
    });

    await einrichten(page);

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByRole('button', { name: /Aus PDF-Bon einlesen/ }).click();
    await page.setInputFiles(
      'input[type="file"][accept="application/pdf"]',
      'e2e/fixtures/bon-textschicht.pdf',
    );

    await expect(page.getByText('Erkannt — die Posten gehen auf die Endsumme auf.')).toBeVisible();
    await expect(page.getByLabel('Topf für Brötchen')).toBeVisible();
  });

  /**
   * Der Bon, dessen Werbezeile als Händler in der Überschrift landete. Geprüft
   * wird beides: dass der Händler stimmt, und dass die Zuordnung aus dem
   * Profil vorbelegt ist — ohne dass irgendwo „Profil" steht.
   */
  test('liest den Bon mit Werbekopf und belegt die Zuordnung vor', async ({ page }) => {
    await einrichten(page);

    // „Sonstiges" entsteht nicht mehr automatisch aus der Ersteinrichtung —
    // für die Vorbelegung aus dem Profil braucht es den Topf trotzdem.
    await page.getByRole('button', { name: 'Neuer Topf' }).click();
    await page.getByLabel('Wofür ist der Topf?').fill('Sonstiges');
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('radio', { name: /^Nur Kategorie/ }).check();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await page.getByRole('button', { name: 'Topf anlegen' }).click();

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByRole('button', { name: /Aus PDF-Bon einlesen/ }).click();
    await page.setInputFiles(
      'input[type="file"][accept="application/pdf"]',
      'e2e/fixtures/bon-werbekopf.pdf',
    );

    await expect(page.getByText('Erkannt — die Posten gehen auf die Endsumme auf.')).toBeVisible();
    // Die Werbezeile steht nicht als Händler da.
    await expect(page.getByText('Musterkette', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Treuepunkte/)).toHaveCount(0);

    // Die Menge klebt nicht im Namen: „Schokolinsen", nicht „Schokolinsen 2 * 0,95".
    await expect(page.getByLabel('Topf für Schokolinsen')).toBeVisible();

    /*
      Aus dem Profil vorbelegt, ohne dass der Nutzer etwas getan hat:
      „Gewebeband" ist Werkzeug und landet auf „Sonstiges" (eben von Hand
      angelegt), „Cola-Mix" auf „Lebensmittel" — den gibt es aus der
      Ersteinrichtung.
    */
    await expect(page.getByLabel('Topf für Gewebeband schwarz')).toHaveValue(/.+/);
    await expect(page.getByLabel('Topf für Cola-Mix Flasche')).toHaveValue(/.+/);

    await page.getByRole('button', { name: /Buchungen anlegen/ }).click();
    await page
      .getByRole('dialog', { name: 'Gebucht' })
      .getByRole('button', { name: 'Fertig' })
      .click();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('27,56', { exact: false }).first()).toBeVisible();

    /*
      Und der Vorschlag wird **nicht** gelernt: Unter „Ordnen" steht nach
      diesem Einkauf keine Zuordnung, die der Nutzer nie angelegt hat.
    */
    await einstellungOeffnen(page, 'Ordnen');
    await expect(page.getByText('gewebeband')).toHaveCount(0);
  });

  test('liest einen Bon ohne Anhang aus der Textschicht', async ({ page }) => {
    await einrichten(page);

    await erfassenOeffnen(page, 'Ausgabe');
    await page.getByRole('button', { name: /Aus PDF-Bon einlesen/ }).click();
    await page.setInputFiles(
      'input[type="file"][accept="application/pdf"]',
      'e2e/fixtures/bon-textschicht.pdf',
    );

    await expect(page.getByText('Erkannt — die Posten gehen auf die Endsumme auf.')).toBeVisible();
    await expect(page.getByLabel('Topf für Brötchen')).toBeVisible();
    await expect(page.getByText(/4 Posten haben noch keinen Topf/)).toBeVisible();

    // Ohne Zuordnung wird daraus eine Buchung ohne Topf — nichts wird geraten.
    await page.getByRole('button', { name: 'Buchung anlegen' }).click();
    await page
      .getByRole('dialog', { name: 'Gebucht' })
      .getByRole('button', { name: 'Fertig' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Gebucht' })).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Ausgabe erfassen' })).toBeHidden();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('1 Buchung', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('4,50', { exact: false }).first()).toBeVisible();
  });
});
