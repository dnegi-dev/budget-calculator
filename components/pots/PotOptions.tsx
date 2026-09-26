/**
 * Die `<option>`-Zeilen einer Topf-Auswahl — Symbol, Name und, wo es nicht
 * selbstverständlich ist, ob der Topf archiviert oder gesperrt ist.
 *
 * Welche Töpfe hineingehören, entscheidet der Aufrufer (`bookablePots` für
 * alles, worauf gebucht wird; alle Töpfe für einen Filter). Die Zeile selbst
 * stand vorher siebenmal im Code, und in den Filtern sah ein archivierter
 * Topf aus wie jeder andere.
 */

import type { Pot } from '../../lib/domain/types';

export function potOptionLabel(
  pot: Pick<Pot, 'icon' | 'name' | 'archivedAt' | 'lockedAt'>,
): string {
  const marker =
    pot.lockedAt !== null ? ' (gesperrt)' : pot.archivedAt !== null ? ' (archiviert)' : '';
  return `${pot.icon} ${pot.name}${marker}`;
}

export function PotOptions({
  pots,
}: {
  pots: readonly Pick<Pot, 'id' | 'icon' | 'name' | 'archivedAt' | 'lockedAt'>[];
}) {
  return (
    <>
      {pots.map((pot) => (
        <option key={pot.id} value={pot.id}>
          {potOptionLabel(pot)}
        </option>
      ))}
    </>
  );
}
