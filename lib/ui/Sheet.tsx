'use client';

/**
 * Bottom Sheet auf dem Telefon, mittiger Dialog ab Tablet-Breite.
 *
 * Bewusst dieselbe Komponente für beides: Ein Erfassungsdialog soll auf dem
 * Desktop nicht anders funktionieren, nur anders sitzen.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useScrollLock } from './useScrollLock';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Kurze Einordnung unter dem Titel. Weglassen, wenn der Titel reicht. */
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, description, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Hintergrund nicht mitscrollen lassen, solange das Sheet offen ist.
  useScrollLock(open);

  /**
   * Nicht `onClose` selbst in die Abhängigkeiten des Effekts unten — einige
   * Aufrufer (etwa `PotWizard`) reichen keine stabile Prop durch, sondern
   * eine im Funktionskörper neu gebaute Hülle (`function close() { reset();
   * onClose(); }`). Die ist bei jedem Rendern eine neue Referenz, und
   * `PotWizard` rendert bei jedem Tastendruck neu (eigener `name`-State).
   * Hinge der Effekt an `onClose`, liefe er dann bei jedem Buchstaben erneut
   * — inklusive `panelRef.current?.focus()`, das den Fokus vom Eingabefeld
   * zurück auf den Dialograhmen riss und auf dem Telefon die Bildschirm-
   * tastatur schloss. Über die Ref bleibt der Escape-Handler trotzdem aktuell,
   * ohne dass seine Identität den Effekt erneut auslöst.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);

    // Fokus in den Dialog holen, sonst liest ein Screenreader weiter den Hintergrund.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={[
          'relative flex max-h-[92vh] w-full flex-col bg-surface',
          'rounded-t-2xl sm:max-w-lg sm:rounded-2xl',
          'border border-line shadow-2xl outline-none',
        ].join(' ')}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 pt-5 pb-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="-mt-1 -mr-1 rounded-lg px-2 py-1 text-xl leading-none text-ink-muted hover:bg-subtle"
          >
            ×
          </button>
        </header>

        {/* overscroll-contain: Am Ende des Sheets soll die Seite dahinter
            nicht weiterscrollen. */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>

        {footer && (
          <footer className="border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
