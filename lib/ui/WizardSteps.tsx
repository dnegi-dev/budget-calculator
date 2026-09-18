/**
 * Fortschrittsanzeige für mehrstufige Dialoge.
 *
 * Nur Punkte, keine Beschriftung: Ein Wizard mit vier Schritten soll nicht
 * mehr Platz für die Navigation brauchen als für die Frage.
 */
export function WizardSteps({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Schritt ${current + 1} von ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={[
            'h-1.5 rounded-full transition-all',
            index === current ? 'w-6 bg-accent' : index < current ? 'w-1.5 bg-accent' : 'w-1.5 bg-line-strong',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
