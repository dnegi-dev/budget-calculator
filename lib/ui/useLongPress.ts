'use client';

/**
 * Langes Drücken als zweite Bedienung an einem Knopf.
 *
 * Es gab im Projekt vorher keine einzige Gestenbehandlung — kein
 * `onPointerDown`, kein `onTouchStart`, kein `onContextMenu`. Deshalb steht
 * das hier einmal als Haken und nicht als drei Handler in einer Komponente.
 *
 * Drei Dinge, die eine naive Fassung falsch macht:
 *
 * 1. **Bewegung bricht ab.** Wer eine Liste scrollt, legt den Finger irgendwo
 *    auf — auch auf dem schwebenden Knopf. Ohne die Schwelle von wenigen
 *    Pixeln öffnet jedes Scrollen das Menü.
 * 2. **Nach dem Auslösen kommt kein Klick mehr.** Das `click`-Ereignis folgt
 *    auf `pointerup` und würde die Standardaktion obendrauf ausführen. Der
 *    Haken merkt sich, dass er ausgelöst hat, und `onClick` fragt das ab.
 * 3. **Das Kontextmenü wird nur unterdrückt, wenn es uns betrifft.** Ein
 *    `preventDefault()` auf jedem `contextmenu` nimmt dem Nutzer am ganzen
 *    Rest der Seite das Menü des Browsers weg.
 *
 * Langes Drücken ist für Tastatur und Screenreader unerreichbar. Der Haken
 * liefert deshalb nur die halbe Bedienung; der zweite Weg (eine Taste, die
 * dasselbe öffnet) gehört an die Aufrufstelle und ist dort nicht optional.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

/** Ab hier gilt ein Druck als „lang". 450 ms: lang genug, um nicht aus Versehen auszulösen, kurz genug, um nicht wie ein Hänger zu wirken. */
const DAUER_MS = 450;

/** Ab dieser Verschiebung ist es ein Wischen und kein Drücken. */
const TOLERANZ_PX = 10;

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
}

export interface LongPress {
  handlers: LongPressHandlers;
  /**
   * Ob der letzte Druck lang war. `onClick` fragt das ab und tut dann nichts
   * — und setzt es zurück, damit der nächste Klick wieder zählt.
   */
  consumeTriggered: () => boolean;
}

export function useLongPress(onLongPress: () => void): LongPress {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const triggered = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  // Ein laufender Timer nach dem Ausbauen würde `onLongPress` auf einer
  // Komponente aufrufen, die nicht mehr da ist.
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // Nur die primäre Taste: Rechtsklick läuft über `onContextMenu`, und
      // beides zugleich löste zweimal aus.
      if (event.button !== 0) return;
      triggered.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        timer.current = null;
        triggered.current = true;
        onLongPress();
      }, DAUER_MS);
    },
    [onLongPress],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const von = start.current;
      if (von === null) return;
      const weg = Math.abs(event.clientX - von.x) + Math.abs(event.clientY - von.y);
      if (weg > TOLERANZ_PX) clear();
    },
    [clear],
  );

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      // Rechtsklick auf dem Desktop: dasselbe Menü, und das des Browsers
      // bleibt weg — hier, weil es genau dieser Knopf ist.
      event.preventDefault();
      clear();
      triggered.current = true;
      onLongPress();
    },
    [clear, onLongPress],
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
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu,
    },
    consumeTriggered,
  };
}
