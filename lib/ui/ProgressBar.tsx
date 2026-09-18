/**
 * Verbrauchsbalken eines Topfes.
 *
 * Drei Zustände, an der Farbe ablesbar: im Rahmen, knapp (ab 85 %), überzogen.
 * Kein Prozenttext im Balken — die Zahl steht daneben als Betrag, und das ist
 * die Information, die zählt.
 */
export function ProgressBar({
  progress,
  color,
  overspent,
}: {
  /** 0..1+, `null` bei Töpfen ohne Limit. */
  progress: number | null;
  color: string;
  overspent: boolean;
}) {
  if (progress === null) return null;

  const percent = Math.min(100, Math.max(0, progress * 100));
  const tone = overspent ? 'var(--negative)' : progress >= 0.85 ? 'var(--warning)' : color;

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-subtle"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.max(percent, progress > 0 ? 2 : 0)}%`, background: tone }}
      />
    </div>
  );
}
