import { expect, test } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen } from './helpers';
import type { Page } from '@playwright/test';

/**
 * Wählt einen Topf über den Text der Option.
 *
 * `selectOption({ label })` braucht den Text genau — und der enthält ein
 * Emoji. Über den Wert (die Topf-ID) ist es stabil.
 */
async function topfWaehlen(page: Page, feld: string, topf: string): Promise<void> {
  const select = page.getByLabel(feld);
  const wert = await select.locator('option', { hasText: topf }).first().getAttribute('value');
  if (!wert) throw new Error(`Keine Option für ${topf} in ${feld}`);
  await select.selectOption(wert);
}

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
    await topfWaehlen(page, 'Alles auf einen Topf', 'Wohnen');
    await topfWaehlen(page, 'Topf für Kaffee to go', 'Mobilität');

    await page.getByRole('button', { name: '2 Buchungen anlegen' }).click();
    // Zwei Dialoge sind offen — der Bon liegt über dem Erfassen-Sheet. Nach
    // dem Buchen müssen beide weg sein.
    await expect(page.getByRole('dialog', { name: 'Bon einlesen' })).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Ausgabe erfassen' })).toBeHidden();

    // Zwei Buchungen, als ein Einkauf erkennbar, mit einem Beleg.
    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('2 Buchungen', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/Einkauf mit 2 Buchungen/).first()).toBeVisible();
    await expect(page.getByText(/1 Beleg/).first()).toBeVisible();

    // 2,50 € auf Wohnen (Brötchen + Pfand − Rabatt), 2,00 € auf Mobilität.
    await expect(page.getByText('2,50', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('2,00', { exact: false }).first()).toBeVisible();

    // Gelernt: Die Zuordnungen stehen in den Einstellungen.
    await page.getByRole('link', { name: 'Einstellungen' }).first().click();
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
    await expect(page.getByRole('dialog', { name: 'Bon einlesen' })).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Ausgabe erfassen' })).toBeHidden();

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByText('1 Buchung', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('4,50', { exact: false }).first()).toBeVisible();
  });
});
