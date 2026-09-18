'use client';

/**
 * Der schwebende Knopf zum Erfassen — mobil auf jeder Seite.
 *
 * Er ersetzt die Erfassen-Knöpfe, die vorher auf einzelnen Seiten standen:
 * Etwas einzutragen ist der häufigste Grund, die App zu öffnen, und der Weg
 * dorthin soll nicht davon abhängen, auf welcher Seite man gerade ist.
 *
 * Ein Tippen öffnet die Frage, die vorher im Erfassungs-Sheet als Umschalter
 * stand: Ausgabe oder Einnahme. Danach fällt dieser Umschalter weg
 * (`lockKind`) — eine gerade beantwortete Frage wird nicht noch einmal
 * gestellt.
 *
 * Nur bis `md`: Auf dem Desktop tragen die Seiten ihre eigenen Knöpfe, und ein
 * schwebendes Element in der Ecke eines breiten Fensters ist dort eher im Weg.
 */

import { useState } from 'react';
import { useCan } from '../lib/auth/provider';
import { useSnapshot } from '../lib/data/provider';
import type { EntryKind } from '../lib/domain/types';
import { Sheet } from '../lib/ui/Sheet';
import { EntrySheet } from './entries/EntrySheet';

export function QuickEntryButton() {
  const snapshot = useSnapshot();
  const can = useCan();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [kind, setKind] = useState<EntryKind | null>(null);

  if (!can('entry.create')) return null;

  const activePots = snapshot.pots.filter((pot) => pot.archivedAt === null);

  return (
    <>
      <button
        type="button"
        onClick={() => setChooserOpen(true)}
        aria-label="Buchung erfassen"
        className={[
          'fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full md:hidden',
          // Über der unteren Leiste, samt Geräte-Sicherheitsbereich.
          'bottom-[calc(4.75rem+env(safe-area-inset-bottom))]',
          'bg-accent text-accent-ink text-3xl leading-none',
          'shadow-lg active:opacity-85',
        ].join(' ')}
      >
        <span aria-hidden className="-mt-0.5">
          +
        </span>
      </button>

      <Sheet
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        title="Was möchtest du erfassen?"
      >
        <div className="flex flex-col gap-2">
          <ChoiceRow
            icon="−"
            label="Ausgabe"
            hint="Geht von einem Topf ab"
            onClick={() => {
              setChooserOpen(false);
              setKind('expense');
            }}
          />
          <ChoiceRow
            icon="+"
            label="Einnahme"
            hint="Kommt dem Haushalt zu"
            onClick={() => {
              setChooserOpen(false);
              setKind('income');
            }}
          />
        </div>
      </Sheet>

      <EntrySheet
        open={kind !== null}
        onClose={() => setKind(null)}
        pots={activePots}
        defaultKind={kind ?? 'expense'}
        lockKind
      />
    </>
  );
}

function ChoiceRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: string;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-4 py-4 text-left hover:bg-subtle"
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-xl leading-none"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
    </button>
  );
}
