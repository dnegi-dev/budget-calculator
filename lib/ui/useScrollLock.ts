'use client';

/**
 * Sperrt das Scrollen im Hintergrund, solange ein Overlay offen ist.
 *
 * Warum nicht einfach `body.style.overflow = 'hidden'`, wie es vorher im Sheet
 * stand: `app/globals.css` setzt `html { overflow-x: hidden }`. Ist eine Achse
 * `hidden`, rechnet CSS die andere von `visible` auf `auto` — damit ist `html`
 * selbst Scrollcontainer, und das `overflow` von `body` wird nicht mehr auf
 * den Viewport übertragen. Die Seite scrollte also weiter. Gegenprobe bei
 * offenem Sheet: `getComputedStyle(document.documentElement).overflowY`
 * liefert `auto`.
 *
 * Deshalb wird hier beides gesperrt **und** die Position festgehalten
 * (`position: fixed; top: -y`). Letzteres ist der einzige Weg, der auch auf
 * iOS Safari hält, wo `overflow: hidden` das Wischen nicht aufhält.
 *
 * Gezählt, nicht geschaltet: `QuickEntryButton` schließt das Auswahl-Sheet und
 * öffnet das Erfassungs-Sheet im selben Commit. Zwei Sperren überlappen, und
 * ein einfaches Speichern-und-Zurücksetzen würde beim Übergang den Zustand des
 * jeweils anderen wiederherstellen.
 */

import { useEffect } from 'react';

let locks = 0;
let restore: (() => void) | null = null;

function lock(): void {
  locks += 1;
  if (locks > 1) return;

  const root = document.documentElement;
  const body = document.body;
  const scrollY = window.scrollY;

  const previous = {
    rootOverflow: root.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyWidth: body.style.width,
  };

  root.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  // Ohne die Breite fällt ein `position: fixed`-Body auf seine Inhaltsbreite
  // zusammen, und das Layout springt beim Öffnen.
  body.style.width = '100%';

  restore = () => {
    root.style.overflow = previous.rootOverflow;
    body.style.overflow = previous.bodyOverflow;
    body.style.position = previous.bodyPosition;
    body.style.top = previous.bodyTop;
    body.style.width = previous.bodyWidth;
    window.scrollTo(0, scrollY);
  };
}

function unlock(): void {
  locks = Math.max(0, locks - 1);
  if (locks > 0) return;
  restore?.();
  restore = null;
}

/** Sperrt, solange `active` gilt. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
