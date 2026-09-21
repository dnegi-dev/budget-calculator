import { expect, test, type Page } from '@playwright/test';
import { einrichten, entsperren, erfassenOeffnen, istMobil } from './helpers';

/**
 * Die klebende Leiste über den Listen.
 *
 * Geprüft wird nicht, dass sie da ist, sondern dass sie beim Scrollen oben
 * bleibt **und** der Datumskopf der Buchungsliste darunter klebt statt
 * dahinter. Der zweite Teil ist der, der leicht kaputtgeht: Der Datumskopf
 * rechnet mit `--list-toolbar-h`, und diese Variable setzt die Leiste zur
 * Laufzeit.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

/** Eine Ausgabe auf den ersten Vorschlagstopf, nur um die Liste zu füllen. */
async function ausgabeErfassen(page: Page, betrag: string) {
  await erfassenOeffnen(page, 'Ausgabe');
  await page.getByLabel('Betrag').fill(betrag);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: /Haushalt/ }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test.describe('Klebende Leiste', () => {
  test('Überschrift und Symbole bleiben oben, der Datumskopf darunter', async ({ page }) => {
    await einrichten(page);
    for (const betrag of ['1000', '2000', '3000', '4000']) {
      await ausgabeErfassen(page, betrag);
    }

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    await expect(page.getByRole('heading', { name: 'Buchungen', level: 1 })).toBeVisible();

    /*
      Ein flaches Fenster, damit vier Buchungen schon zum Scrollen reichen.
      Zweihundert anzulegen würde dasselbe zeigen und zwei Minuten dauern.
    */
    const vorher = page.viewportSize();
    await page.setViewportSize({ width: vorher?.width ?? 390, height: 420 });

    const titel = page.getByRole('heading', { name: 'Buchungen', level: 1 });
    const datumskopf = page.locator('p.sticky').first();
    await expect(datumskopf).toBeVisible();

    await page.mouse.wheel(0, 600);
    // Warten, bis das Scrollen angekommen ist — sonst messen wir die Lage von
    // vorher und der Test wäre auch grün, wenn nichts klebte.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

    // Die Überschrift ist noch da, nicht nach oben weggescrollt.
    await expect(titel).toBeInViewport();
    const kopf = await titel.boundingBox();
    expect(kopf?.y ?? 999).toBeLessThan(80);

    // Und der Datumskopf klebt **unter** der Leiste.
    const leiste = await page.locator('div.sticky').first().boundingBox();
    const datum = await datumskopf.boundingBox();
    expect(datum?.y ?? 0).toBeGreaterThanOrEqual((leiste?.y ?? 0) + (leiste?.height ?? 0) - 1);

    await page.setViewportSize({ width: vorher?.width ?? 390, height: vorher?.height ?? 800 });
  });

  test('die Suche bleibt beim Scrollen erreichbar', async ({ page }) => {
    await einrichten(page);
    await ausgabeErfassen(page, '1234');

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    const vorher = page.viewportSize();
    await page.setViewportSize({ width: vorher?.width ?? 390, height: 420 });

    await page.mouse.wheel(0, 600);
    // Genau der Fall, für den die Leiste klebt: unten in der Liste suchen,
    // ohne erst wieder hochzuscrollen.
    await page.getByRole('button', { name: 'Suchen' }).click();
    // `type="search"` ist eine `searchbox`, keine `textbox`.
    await page.getByRole('searchbox', { name: 'Suche' }).fill('gibtsnicht');
    await expect(page.getByText('0 Buchungen')).toBeVisible();

    await page.setViewportSize({ width: vorher?.width ?? 390, height: vorher?.height ?? 800 });
  });
});

/**
 * Die zwei Köpfe über der Buchungsliste und die Rechtsleiste unten.
 *
 * Beides ist `position: sticky` mit gerechnetem Versatz, und beides geht
 * still kaputt: Verrechnet sich der Versatz, liegt ein Kopf hinter dem
 * anderen oder die Leiste hinter der Navigation. Ein Test, der nur prüft,
 * dass die Elemente da sind, sähe das nicht.
 */
test.describe('Klebende Köpfe und Rechtsleiste', () => {
  test('Monat klebt unter der Leiste, der Tag unter dem Monat', async ({ page }) => {
    await einrichten(page);
    for (const betrag of ['1000', '2000', '3000', '4000']) {
      await ausgabeErfassen(page, betrag);
    }

    await page.getByRole('link', { name: 'Buchungen' }).first().click();
    const vorher = page.viewportSize();
    await page.setViewportSize({ width: vorher?.width ?? 390, height: 420 });

    const monat = page.locator('p.sticky').first();
    const tag = page.locator('p.sticky').nth(1);
    // Der Monatskopf ist neu; ohne ihn stände hier der Tag an erster Stelle
    // und die Prüfung darunter wäre sinnlos.
    await expect(monat).toHaveText(/\d{4}$/);

    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

    const leiste = await page.locator('div.sticky').first().boundingBox();
    const monatBox = await monat.boundingBox();
    const tagBox = await tag.boundingBox();

    // Monat direkt unter der Werkzeugleiste …
    expect(monatBox?.y ?? 0).toBeGreaterThanOrEqual((leiste?.y ?? 0) + (leiste?.height ?? 0) - 1);
    // … und der Tag direkt unter dem Monat, nicht dahinter.
    expect(tagBox?.y ?? 0).toBeGreaterThanOrEqual((monatBox?.y ?? 0) + (monatBox?.height ?? 0) - 1);

    await page.setViewportSize({ width: vorher?.width ?? 390, height: vorher?.height ?? 800 });
  });

  test('Impressum und Datenschutz bleiben über der Navigation stehen', async ({ page }) => {
    test.skip(!istMobil(page), 'Ab md stehen die Links in der Seitenleiste.');

    await einrichten(page);
    for (const betrag of ['1000', '2000', '3000', '4000']) {
      await ausgabeErfassen(page, betrag);
    }
    await page.getByRole('link', { name: 'Buchungen' }).first().click();

    const vorher = page.viewportSize();
    await page.setViewportSize({ width: vorher?.width ?? 390, height: 420 });

    const leiste = page
      .locator('footer')
      .filter({ has: page.getByRole('link', { name: 'Impressum' }) });
    // Die Klasse muss auch übersetzt worden sein: Ein Tippfehler im
    // `calc()` ergäbe `top: auto`, und die Leiste läge wieder im Fluss.
    await expect(leiste).toHaveCSS('position', 'sticky');
    expect(await leiste.evaluate((el) => getComputedStyle(el).top)).not.toBe('auto');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(leiste).toBeInViewport();

    const unten = await leiste.boundingBox();
    const navigation = await page
      .getByRole('navigation', { name: 'Hauptnavigation' })
      .boundingBox();
    // Über der Navigation, nicht dahinter.
    expect((unten?.y ?? 0) + (unten?.height ?? 0)).toBeLessThanOrEqual((navigation?.y ?? 0) + 1);

    /*
      Und sie klebt wirklich: 40 px zurückgescrollt bleibt sie an derselben
      Stelle im Fenster, statt um 40 px mitzuwandern.

      Warum nur 40 px: Das Klebefenster ist so groß wie der Platz unter der
      Leiste (`pb-36` am `main`, 144 px) minus `--nav-bar-h` (76 px) — also
      68 px. Wer das Polster verkleinert, macht dieses Fenster kleiner.
    */
    await page.evaluate(() => window.scrollBy(0, -40));
    const hoeher = await leiste.boundingBox();
    expect(Math.abs((hoeher?.y ?? 0) - (unten?.y ?? 0))).toBeLessThan(4);

    await page.setViewportSize({ width: vorher?.width ?? 390, height: vorher?.height ?? 800 });
  });
});
