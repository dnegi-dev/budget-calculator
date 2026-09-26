'use client';

/**
 * Wiederkehrende Buchungen.
 *
 * Eigene Unterseite von „Buchungen“ und nicht mehr in den Einstellungen: Eine
 * Regel ist eine Buchung, die sich wiederholt, keine Einstellung. Weil
 * `isActive` in `components/AppShell.tsx` mit `startsWith` arbeitet, bleibt
 * „Buchungen“ in der unteren Leiste dabei markiert — die Leiste behält ihre
 * vier Einträge.
 *
 * Suchen und Filtern liegt hier oben in der klebenden Leiste, nicht in der
 * Karte: Bei zwanzig Abos ist „welches war das?“ die Frage, und sie stellt
 * sich mitten in der Liste.
 */

import { useMemo, useState } from 'react';
import { ListToolbar } from '../../../components/lists/ListToolbar';
import { RecurringSection } from '../../../components/recurring/RecurringSection';
import { useSnapshot } from '../../../lib/data/provider';
import { describeRecurrence } from '../../../lib/domain/recurrence';
import type { EntryKind } from '../../../lib/domain/types';
import { Card } from '../../../lib/ui/Card';
import { SegmentedControl } from '../../../lib/ui/SegmentedControl';
import { selectClass } from '../../../lib/ui/Field';
import { PotOptions } from '../../../components/pots/PotOptions';
import { matchesQuery } from '../../../lib/domain/search';

type ArtFilter = EntryKind | 'all';
type LaufFilter = 'all' | 'active' | 'paused';

export default function RecurringPage() {
  const snapshot = useSnapshot();
  const [suche, setSuche] = useState('');
  const [art, setArt] = useState<ArtFilter>('all');
  const [topf, setTopf] = useState('all');
  const [lauf, setLauf] = useState<LaufFilter>('all');

  const sichtbar = useMemo(() => {
    const potsById = new Map(snapshot.pots.map((pot) => [pot.id, pot]));

    return snapshot.recurringRules.filter((rule) => {
      if (art !== 'all' && rule.kind !== art) return false;
      if (topf === 'none' && rule.potId !== null) return false;
      if (topf !== 'all' && topf !== 'none' && rule.potId !== topf) return false;
      if (lauf === 'paused' && !rule.paused) return false;
      if (lauf === 'active' && rule.paused) return false;

      // Gesucht wird in dem, was in der Zeile steht: Notiz, Topf und der
      // beschriebene Rhythmus („monatlich am 1.“). Nach etwas zu suchen, was
      // nicht sichtbar ist, verwirrt mehr als es hilft.
      const pot = rule.potId ? potsById.get(rule.potId) : null;
      return matchesQuery(suche, rule.note, pot?.name, describeRecurrence(rule));
    });
  }, [snapshot.recurringRules, snapshot.pots, suche, art, topf, lauf]);

  const filterAktiv = art !== 'all' || topf !== 'all' || lauf !== 'all';

  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        title="Wiederkehrende Buchungen"
        back={{ href: '/buchungen', label: 'Buchungen' }}
        search={{ value: suche, onChange: setSuche, placeholder: 'In Notiz und Rhythmus suchen' }}
        filters={
          <div className="flex flex-col gap-3">
            <SegmentedControl
              label="Art"
              value={art}
              onChange={setArt}
              options={[
                { value: 'all', label: 'Alle' },
                { value: 'expense', label: 'Ausgaben' },
                { value: 'income', label: 'Einnahmen' },
              ]}
            />
            <SegmentedControl
              label="Laufen"
              value={lauf}
              onChange={setLauf}
              options={[
                { value: 'all', label: 'Alle' },
                { value: 'active', label: 'Aktiv' },
                { value: 'paused', label: 'Pausiert' },
              ]}
            />
            <select
              className={selectClass}
              value={topf}
              onChange={(event) => setTopf(event.target.value)}
              aria-label="Topf"
            >
              <option value="all">Alle Töpfe</option>
              <option value="none">Ohne Topf</option>
              <PotOptions pots={snapshot.pots} />
            </select>
          </div>
        }
        filtersActive={filterAktiv}
        onResetFilters={() => {
          setArt('all');
          setTopf('all');
          setLauf('all');
        }}
      />

      <RecurringSection rules={sichtbar} filtering={filterAktiv || suche.trim() !== ''} />

      <Card className="px-4 py-3.5">
        <p className="text-sm text-ink-muted">
          Regeln erzeugen ihre Buchungen beim Öffnen der App — rückwirkend bis zum Beginn der Regel.
          Eine pausierte Regel erzeugt nichts, bleibt aber erhalten.
        </p>
      </Card>
    </div>
  );
}
