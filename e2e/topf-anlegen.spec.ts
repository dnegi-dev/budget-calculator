import { expect, test } from '@playwright/test';
import { einrichten, entsperren } from './helpers';

/**
 * Der Fund, der diese Datei ausgelöst hat: Beim Tippen im Namensfeld des
 * Topf-Wizards verlor das Feld nach jedem Buchstaben den Fokus. Ursache lag
 * in `lib/ui/Sheet.tsx`, nicht im Wizard selbst — siehe den Kommentar dort.
 *
 * `fill()` würde den Fehler nicht zeigen: Es setzt den Wert direkt im DOM,
 * ohne echte Tastenereignisse. `pressSequentially()` schon — verliert das
 * Feld zwischendurch den Fokus, landen die folgenden Zeichen nicht mehr
 * darin, und der Endwert ist unvollständig.
 */

test.beforeEach(async ({ page }) => {
  await entsperren(page);
});

test.describe('Topf anlegen', () => {
  test('das Namensfeld behält beim Tippen den Fokus', async ({ page }) => {
    await einrichten(page);

    await page.getByRole('button', { name: 'Neuer Topf' }).click();
    const nameFeld = page.getByLabel('Wofür ist der Topf?');
    await nameFeld.pressSequentially('Urlaub', { delay: 30 });

    await expect(nameFeld).toHaveValue('Urlaub');
  });
});
