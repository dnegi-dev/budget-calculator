'use client';

/**
 * „Im Menü": welche Töpfe direkt in der Navigation stehen — am Desktop bis zu
 * vier unter „Töpfe" in der Seitenleiste, mobil einer in der unteren Leiste.
 *
 * Eine Gerätevorliebe (`lib/prefs/device-prefs.ts`), deshalb ohne
 * Rechteprüfung und ohne Sicherung: Es ist die Anordnung des Menüs auf diesem
 * Gerät, keine Aussage über den Haushalt.
 *
 * Zur Auswahl stehen nur nicht archivierte Töpfe. Ein Favorit, dessen Topf
 * später archiviert wird, bleibt gespeichert und ist nach „Wieder aktivieren"
 * wieder da (`resolveFavoritePots`) — er belegt bis dahin aber keinen Platz.
 */

import { useSnapshot } from '../../lib/data/provider';
import {
  MAX_DESKTOP_FAVORITES,
  MAX_MOBILE_FAVORITES,
  resolveFavoritePots,
  toggleFavorite,
} from '../../lib/domain/nav-favorites';
import { setNavFavorites } from '../../lib/prefs/device-prefs';
import { useNavFavoriteIds } from '../../lib/prefs/useDevicePref';
import { Card, CardHeader } from '../../lib/ui/Card';
import { Field, selectClass } from '../../lib/ui/Field';
import { PotIcon } from '../pots/PotIcon';
import { PotOptions } from '../pots/PotOptions';

export function NavFavoritesSection() {
  const snapshot = useSnapshot();
  const auswahl = snapshot.pots.filter((pot) => pot.archivedAt === null);

  const desktopIds = useNavFavoriteIds('desktop');
  const desktop = resolveFavoritePots(desktopIds, snapshot.pots, MAX_DESKTOP_FAVORITES).map(
    (pot) => pot.id,
  );
  const mobil =
    resolveFavoritePots(useNavFavoriteIds('mobile'), snapshot.pots, MAX_MOBILE_FAVORITES)[0]?.id ??
    '';
  const voll = desktop.length >= MAX_DESKTOP_FAVORITES;

  if (auswahl.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Im Menü" />
      <div className="flex flex-col gap-5 px-4 pb-4">
        <Field
          label="Mobil — in der unteren Leiste"
          hint="Ein Topf steht dann direkt neben „Töpfe“."
        >
          {(props) => (
            <select
              {...props}
              className={selectClass}
              value={mobil}
              onChange={(event) =>
                setNavFavorites('mobile', event.target.value === '' ? [] : [event.target.value])
              }
            >
              <option value="">Kein Topf</option>
              <PotOptions pots={auswahl} />
            </select>
          )}
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Desktop — in der Seitenleiste</legend>
          <p className="text-sm text-ink-muted">
            {voll
              ? `Höchstens ${MAX_DESKTOP_FAVORITES} — nimm einen heraus, um einen anderen zu wählen.`
              : `Bis zu ${MAX_DESKTOP_FAVORITES} Töpfe, in der Reihenfolge, in der du sie wählst.`}
          </p>
          <ul className="flex flex-col gap-1">
            {auswahl.map((pot) => {
              const gewaehlt = desktop.includes(pot.id);
              const gesperrt = !gewaehlt && voll;
              return (
                <li key={pot.id}>
                  <label
                    className={[
                      'flex items-center gap-3 rounded-xl px-2 py-1.5',
                      gesperrt ? 'opacity-50' : 'cursor-pointer hover:bg-subtle',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={gewaehlt}
                      disabled={gesperrt}
                      onChange={() =>
                        setNavFavorites(
                          'desktop',
                          toggleFavorite(desktopIds, pot.id, MAX_DESKTOP_FAVORITES, desktop),
                        )
                      }
                    />
                    <PotIcon pot={pot} className="h-7 w-7 rounded-md text-sm" />
                    <span className="truncate">{pot.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </div>
    </Card>
  );
}
