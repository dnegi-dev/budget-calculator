'use client';

/**
 * Wischen nach links als Abkürzung an einer Listenzeile.
 *
 * Gebaut wie `lib/ui/useLongPress.ts` und aus demselben Grund von Hand statt
 * als Abhängigkeit: Es ist die zweite Geste im Projekt, und eine Bibliothek
 * für zwei Gesten wäre mehr Wartung als Ersparnis.
 *
 * Vier Dinge, die eine naive Fassung falsch macht:
 *
 * 1. **Senkrechtes Scrollen darf nicht wischen.** Die Spur beginnt erst, wenn
 *    die waagerechte Bewegung die senkrechte übersteigt **und** eine kleine
 *    Schwelle reißt. Ohne das zieht jeder Daumen beim Scrollen Zeilen auf.
 * 2. **`touch-action: pan-y` gehört an die Zeile.** Sonst scrollt der Browser
 *    waagerecht mit, und `preventDefault` kommt bei einem passiven Listener
 *    zu spät. Die Klasse liefert der Haken gleich mit.
 * 3. **Nach dem Wischen kommt kein Klick mehr.** Wie beim langen Drücken
 *    folgt `click` auf `pointerup` und öffnete sonst die Buchung, die man
 *    gerade gelöscht hat. `consumeTriggered()` fragt das ab.
 * 4. **Der Zeiger wird eingefangen.** Ohne `setPointerCapture` endet die Spur,
 *    sobald der Finger die Zeile verlässt — bei einer 44 px hohen Zeile
 *    passiert das ständig.
 *
 * Eine Geste ist für Tastatur und Screenreader unerreichbar. Wie beim langen
 * Drücken ist sie deshalb nur die halbe Bedienung: Der zweite Weg (hier der
 * Löschknopf in der Buchung) gehört an die Aufrufstelle und ist dort nicht
 * optional.
 */

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Ab hier gilt die Bewegung als waagerecht gemeint und nicht als Scrollen. */
const START_PX = 12;

/** Weiter als so weit lässt sich die Zeile nicht ziehen. */
const MAX_PX = 120;

/** Ab hier löst das Loslassen aus. */
const SCHWELLE_PX = 96;

export interface SwipeHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface SwipeAction {
  handlers: SwipeHandlers;
  /** Wie weit die Zeile gerade nach links steht, in Pixeln (0 … `MAX_PX`). */
  offset: number;
  /** Ob der Finger die Zeile gerade führt — dann ohne Übergang animieren. */
  ziehend: boolean;
  /** Ob gerade ausgelöst wurde. Setzt sich beim Abfragen zurück. */
  consumeTriggered: () => boolean;
}

/**
 * @param onSwipe  Läuft beim Loslassen jenseits der Schwelle.
 * @param enabled  Aus heißt: keine Handler, kein Versatz — die Zeile
 *                 verhält sich wie vorher.
 */
export function useSwipeAction(onSwipe: () => void, enabled = true): SwipeAction {
  const [offset, setOffset] = useState(0);
  const [ziehend, setZiehend] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const aktiv = useRef(false);
  const triggered = useRef(false);

  const beenden = useCallback(() => {
    start.current = null;
    aktiv.current = false;
    setZiehend(false);
    setOffset(0);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      triggered.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      aktiv.current = false;
    },
    [enabled],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const von = start.current;
    if (von === null) return;

    const dx = event.clientX - von.x;
    const dy = event.clientY - von.y;

    if (!aktiv.current) {
      // Senkrecht gemeint: Spur aufgeben und dem Browser das Scrollen
      // überlassen. Nach rechts ebenso — es gibt nur eine Richtung.
      if (Math.abs(dy) > Math.abs(dx)) {
        start.current = null;
        return;
      }
      if (dx > -START_PX) return;
      aktiv.current = true;
      setZiehend(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    setOffset(Math.min(MAX_PX, Math.max(0, -dx)));
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const warAktiv = aktiv.current;
      const weit = offset >= SCHWELLE_PX;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      beenden();
      if (warAktiv) {
        // Auch unterhalb der Schwelle: Es war ein Wischen, kein Tippen — die
        // Buchung soll sich danach nicht öffnen.
        triggered.current = true;
        if (weit) onSwipe();
      }
    },
    [beenden, offset, onSwipe],
  );

  const consumeTriggered = useCallback(() => {
    const war = triggered.current;
    triggered.current = false;
    return war;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    offset: enabled ? offset : 0,
    ziehend,
    consumeTriggered,
  };
}
