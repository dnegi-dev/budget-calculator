import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Setzt den Entsperr-Merker, bevor die erste Seite lädt.
 *
 * Ohne das landet jeder Test zuerst im Anmeldefenster. Die Anmeldung selbst
 * prüft `login.spec.ts`; die übrigen Tests sollen den Alltag prüfen und nicht
 * jedes Mal dieselbe Tür aufmachen.
 *
 * Muss den Schlüssel aus `lib/auth/local-credentials.ts` spiegeln — er steht
 * hier als Literal, weil der Testcode nicht gegen das Anwendungsbundle
 * gebaut wird.
 */
const UNLOCK_KEY = 'haushalt.unlocked';

export async function entsperren(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Ohne Speicher bleibt das Anmeldefenster stehen — der Test schlägt
      // dann sichtbar fehl statt still etwas anderes zu prüfen.
    }
  }, UNLOCK_KEY);
}

/**
 * Die Breite, ab der Tailwind `md:` greift. Der schwebende Knopf ist
 * `md:hidden`, der Knopf auf der Seite `hidden md:block` — welcher da ist,
 * entscheidet also allein das Fenster.
 */
const MD_BREAKPOINT = 768;

/**
 * Hält den Knopf lange gedrückt.
 *
 * Über die Maus und nicht über `dispatchEvent`: Der Haken in
 * `lib/ui/useLongPress.ts` prüft `event.button` und die Bewegung, und
 * zusammengebaute Ereignisse würden genau diese Prüfungen überspringen — der
 * Test wäre dann grün, ohne dass ein Finger das Menü öffnen könnte.
 * 700 ms: die Schwelle liegt bei 450.
 */
export async function langDruecken(page: Page, ziel: Locator): Promise<void> {
  const box = await ziel.boundingBox();
  if (!box) throw new Error('Der Knopf ist nicht sichtbar.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

/** Der schwebende Knopf — erkennbar am Zusatz im `aria-label`. */
export function schwebenderKnopf(page: Page): Locator {
  return page.getByRole('button', { name: /lang drücken/ });
}

/**
 * Öffnet das Erfassen über den schwebenden Knopf (mobil) oder den Knopf auf
 * der Seite (Desktop) und wählt die Art.
 *
 * Die Entscheidung fällt über die Fensterbreite, nicht über `isVisible()`:
 * Das wartet nicht und liefert direkt nach einem Seitenwechsel `false`,
 * bevor der Knopf überhaupt gerendert ist — der Test landete dann still im
 * falschen Zweig.
 *
 * Mobil gibt es die Zwischenfrage nicht mehr: Ein Tippen öffnet die
 * Standardaktion (Ausgabe), und „Einnahme" liegt hinter langem Drücken.
 */
export async function erfassenOeffnen(page: Page, art: 'Ausgabe' | 'Einnahme'): Promise<void> {
  const breite = page.viewportSize()?.width ?? MD_BREAKPOINT;

  if (breite < MD_BREAKPOINT) {
    const knopf = schwebenderKnopf(page);
    if (art === 'Ausgabe') {
      await knopf.click();
    } else {
      await langDruecken(page, knopf);
      await page.getByRole('menuitem', { name: art }).click();
    }
    return;
  }

  // Desktop: Knopf auf der Seite, Art danach im Sheet.
  await page.getByRole('button', { name: 'Ausgabe erfassen' }).click();
  if (art === 'Einnahme') await page.getByRole('radio', { name: 'Einnahme' }).click();
}

/**
 * Ersteinrichtung im Schnelldurchlauf.
 *
 * Acht Schritte: Name, Währung/Periode, Einkommen (leer gelassen), Betragsart
 * (bleibt bei der voreingestellten „Frei" — „Fest" ist ohne Einkommen ohnehin
 * gesperrt), dann je ein Schritt für Lebensmittel, Haushalt, Hobby und
 * Urlaub. Lebensmittel und Haushalt sind voreingestellt aktiv, Hobby und
 * Urlaub nicht — die Tests, die diesen Helfer benutzen, prüfen nicht den
 * Wizard selbst (das macht `alltag.spec.ts`), sondern brauchen nur einen
 * eingerichteten Haushalt mit den beiden Standard-Töpfen.
 */
export async function einrichten(page: Page, name = 'Testhaushalt'): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Name des Haushalts').fill(name);
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: 'Währung und Periode' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: /Einkommen/ })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: /Beträge gesetzt/ })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: 'Lebensmittel' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: 'Haushalt' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: 'Hobby' })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByRole('heading', { name: 'Urlaub' })).toBeVisible();
  await page.getByRole('button', { name: /Los geht/ }).click();

  await expect(page.getByRole('link', { name: /Lebensmittel/ })).toBeVisible();
}

/** Ob das Fenster schmaler ist als der `md`-Umbruch — mobile Oberfläche. */
export function istMobil(page: Page): boolean {
  return (page.viewportSize()?.width ?? MD_BREAKPOINT) < MD_BREAKPOINT;
}

/**
 * Wählt in einem Auswahlfeld die Option, deren Text den Begriff enthält.
 *
 * `selectOption({ label })` braucht den Text genau — und die Topf-Optionen
 * tragen ein Emoji davor. Über den Wert (die Topf-ID) ist es stabil, und ein
 * Regex-Label unterstützt Playwright nicht.
 */
export async function optionWaehlen(page: Page, feld: string, text: string): Promise<void> {
  const select = page.getByLabel(feld).first();
  const wert = await select.locator('option', { hasText: text }).first().getAttribute('value');
  if (wert === null) throw new Error(`Keine Option für ${text} in ${feld}`);
  await select.selectOption(wert);
}

/**
 * Klappt die Filter in der klebenden Leiste auf.
 *
 * Seit die Leiste überall dieselbe ist, liegen sie an jeder Breite hinter dem
 * Symbol — der Zweig nach Fensterbreite ist damit weg.
 */
export async function filterOeffnen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Filter' }).click();
}

/**
 * Öffnet einen Punkt der Einstellungen.
 *
 * Seit die Einstellungen Unterseiten haben, sind es zwei Klicks: erst die
 * Übersicht, dann die Zeile. Der Name der Zeile enthält auch ihre Unterzeile,
 * deshalb der Anker am Anfang.
 */
export async function einstellungOeffnen(page: Page, punkt: string): Promise<void> {
  await page.getByRole('link', { name: 'Einstellungen' }).first().click();
  await page.getByRole('link', { name: new RegExp(`^${punkt}`) }).click();
  await expect(page.getByRole('heading', { name: punkt, level: 1 })).toBeVisible();
}

/**
 * Wischt eine Zeile nach links.
 *
 * Über die Maus und nicht über `dispatchEvent`, aus demselben Grund wie bei
 * `langDruecken`: `lib/ui/useSwipeAction.ts` prüft `event.button`, das
 * Verhältnis von waagerechter zu senkrechter Bewegung und fängt den Zeiger
 * ein. Zusammengebaute Ereignisse gingen an diesen Prüfungen vorbei, und der
 * Test wäre grün, ohne dass ein Finger etwas auslösen könnte.
 *
 * `steps` ist nicht Kosmetik: Ohne Zwischenschritte gibt es genau ein
 * `pointermove`, und der Haken bräuchte dann den ganzen Weg in einem Sprung.
 */
export async function wischen(page: Page, ziel: Locator, weite = 130): Promise<void> {
  const box = await ziel.boundingBox();
  if (!box) throw new Error('Die Zeile ist nicht sichtbar.');
  const y = box.y + box.height / 2;
  const x = box.x + box.width - 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - weite, y, { steps: 12 });
  await page.mouse.up();
}
