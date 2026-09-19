'use client';

/**
 * Die beiden Wege zum Löschen einer Buchung — und die Rückfrage dazwischen.
 *
 * Gerätevorlieben, keine Haushaltswerte (`lib/prefs/device-prefs.ts`):
 * Wischen ist eine Berührungsgeste, die es am Desktop gar nicht gibt. Eine
 * Aussage über „diesen Haushalt" wäre sie damit nicht. Wer das Löschen für
 * alle unterbinden will, nimmt die Rolle „Nur Lesen" — die wirkt im
 * Repository und nicht nur an einem Knopf.
 *
 * Steht bei „Erfassen" und nicht in der Gefahrenzone: Dort steht, was man
 * einmal tut und was alles betrifft (`wipeAll`). Hier wird eingestellt, wie
 * der Alltag sich bedient.
 */

import { setDeleteButton, setSwipeConfirm, setSwipeDelete } from '../../lib/prefs/device-prefs';
import { useDeleteButton, useSwipeConfirm, useSwipeDelete } from '../../lib/prefs/useDevicePref';
import { Card, CardHeader } from '../../lib/ui/Card';

export function DeleteSection() {
  const wischen = useSwipeDelete();
  const rueckfrage = useSwipeConfirm();
  const knopf = useDeleteButton();

  return (
    <Card>
      <CardHeader title="Löschen" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-col gap-2">
          <Schalter
            label="Wischen löscht eine Buchung"
            checked={wischen}
            onChange={setSwipeDelete}
          />
          {/*
            Eingerückt und ausgegraut statt versteckt: Ein Schalter, der
            verschwindet, wirkt wie ein Fehler — und wer das Wischen wieder
            einschaltet, soll sehen, was dann gilt.
          */}
          <div className={`pl-6 ${wischen ? '' : 'opacity-50'}`}>
            <Schalter
              label="Vorher nachfragen"
              checked={rueckfrage}
              disabled={!wischen}
              onChange={setSwipeConfirm}
            />
          </div>
          <p className="text-xs text-ink-muted">
            {rueckfrage
              ? 'Nach dem Wischen kommt eine Rückfrage.'
              : 'Ohne Rückfrage ist die Buchung sofort weg — es gibt kein Rückgängig.'}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Schalter label="Löschknopf in der Buchung" checked={knopf} onChange={setDeleteButton} />
          <p className="text-xs text-ink-muted">
            Der Weg ohne Geste — und der einzige mit Tastatur oder Screenreader. Ohne ihn lässt sich
            eine Buchung nur durch Wischen entfernen.
          </p>
        </div>

        <p className="text-xs text-ink-muted">
          Gilt nur auf diesem Gerät und steht nicht in der Sicherung. Eine Buchung aus einem
          eingelesenen Bon wird immer über ihren Einkauf gelöscht, nie einzeln.
        </p>
      </div>
    </Card>
  );
}

function Schalter({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}
