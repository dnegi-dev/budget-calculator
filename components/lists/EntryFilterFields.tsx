'use client';

/**
 * Die Filterfelder zu `useEntryFilters` — Art, Topf, Tag.
 *
 * Getrennt vom Haken, weil ein Haken, der JSX zurückgibt, beim Lesen
 * überrascht: Der Haken hält den Zustand, diese Komponente zeigt ihn. Die
 * Leiste (`ListToolbar`) weiß von beidem nichts.
 *
 * `pots` ist die **vollständige** Liste inklusive archivierter Töpfe: Wer nach
 * einem archivierten Topf filtern will, sucht meist gerade dessen alte
 * Buchungen.
 */

import type { Pot } from '../../lib/domain/types';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import { selectClass } from '../../lib/ui/Field';
import type { EntryFilters } from './useEntryFilters';
import { PotOptions } from '../pots/PotOptions';

export function EntryFilterFields({
  filters,
  pots,
  tags,
  tagsEnabled,
  /** Auf einer Topf-Seite steht der Topf fest — dort wäre das Feld sinnlos. */
  withPot = true,
  /**
   * Wortpaar für „Ausgaben"/„Einnahmen" — auf einem Sparziel-Topf „Einzahlen"/
   * „Ausgeben" statt der sonst üblichen Wörter (`lib/domain/entry-kinds.ts`).
   */
  kindLabels = { expense: 'Ausgaben', income: 'Einnahmen' },
}: {
  filters: EntryFilters;
  pots: readonly Pot[];
  tags: readonly string[];
  tagsEnabled: boolean;
  withPot?: boolean;
  kindLabels?: { expense: string; income: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label="Art"
        value={filters.kind}
        onChange={filters.setKind}
        options={[
          { value: 'all', label: 'Alle' },
          { value: 'expense', label: kindLabels.expense },
          { value: 'income', label: kindLabels.income },
        ]}
      />
      {withPot && (
        <select
          className={selectClass}
          value={filters.pot}
          onChange={(event) => filters.setPot(event.target.value)}
          aria-label="Topf"
        >
          <option value="all">Alle Töpfe</option>
          <option value="none">Ohne Topf</option>
          <PotOptions pots={pots} />
        </select>
      )}
      {/* Ohne benutzte Tags gibt es nichts zu filtern — dann auch kein Feld. */}
      {tagsEnabled && tags.length > 0 && (
        <select
          className={selectClass}
          value={filters.tag}
          onChange={(event) => filters.setTag(event.target.value)}
          aria-label="Tag"
        >
          <option value="all">Alle Tags</option>
          <option value="none">Ohne Tag</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
