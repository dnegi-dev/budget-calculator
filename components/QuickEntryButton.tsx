'use client';

/**
 * Der schwebende Knopf zum Erfassen — mobil auf jeder Seite.
 *
 * Er ersetzt die Erfassen-Knöpfe, die vorher auf einzelnen Seiten standen:
 * Etwas einzutragen ist der häufigste Grund, die App zu öffnen, und der Weg
 * dorthin soll nicht davon abhängen, auf welcher Seite man gerade ist.
 *
 * **Ein Tippen führt direkt zur Standardaktion.** Vorher kam erst die Frage
 * „Ausgabe oder Einnahme?", und die Antwort war fast immer dieselbe — ein
 * Schritt bei jeder Erfassung, für einen Fall, der selten eintritt. Die Aktion
 * ist einstellbar, allgemein und je Bereich; die Regeln dazu stehen in
 * `lib/domain/fab.ts`. Wer „Fragen" einstellt, bekommt das alte Verhalten.
 *
 * Der seltene Fall liegt hinter **langem Drücken**: dann klappt das Menü
 * senkrecht über dem Knopf auf, Beschriftung links vom Symbol. Weil langes
 * Drücken für Tastatur und Screenreader nicht erreichbar ist, öffnet **Pfeil
 * nach oben** dasselbe Menü — ohne diesen zweiten Weg wäre „Einnahme" mobil
 * per Tastatur unerreichbar, und das `aria-label` nennt deshalb beides.
 *
 * Auf der Topf-Detailseite ist der Topf vorbelegt: Er steht als `?pot=` in der
 * Adresse. Dafür braucht der Knopf `useSearchParams` und damit eine
 * `Suspense`-Grenze — die steht in `AppShell`, nicht hier, weil sie den Knopf
 * umschließen muss.
 *
 * **Der Knopf trägt immer ein Plus**, auch wenn die Standardaktion „Ausgabe"
 * ist. Vorher stand dort ein Rechenzeichen, und das beschreibt den Betrag,
 * nicht die Handlung: Angelegt wird in beiden Fällen etwas. Welche Art es
 * wird, steht im `aria-label` und im Menü — dort tragen Ausgabe und Einnahme
 * gegenständliche Symbole (Einkaufswagen, Sparschwein), weil zwei
 * Rechenzeichen nebeneinander wie eine Operation aussehen und nicht wie eine
 * Wahl.
 *
 * Nur bis `md`: Auf dem Desktop tragen die Seiten ihre eigenen Knöpfe, und ein
 * schwebendes Element in der Ecke eines breiten Fensters ist dort eher im Weg.
 */

import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PiggyBank, Plus, ShoppingCart, type LucideIcon } from 'lucide-react';
import { useCan } from '../lib/auth/provider';
import { useSnapshot } from '../lib/data/provider';
import { entryKindActionLabel, entryKindLabel } from '../lib/domain/entry-kinds';
import {
  fabLabel,
  fabVisibleOnPath,
  resolveFabAction,
  resolveGoalFabAction,
  scopeForPath,
} from '../lib/domain/fab';
import { bookablePots, goalPhaseOf } from '../lib/domain/pot-kinds';
import type { EntryKind } from '../lib/domain/types';
import { Icon } from '../lib/ui/Icon';
import { Sheet } from '../lib/ui/Sheet';
import { useLongPress } from '../lib/ui/useLongPress';
import { EntrySheet } from './entries/EntrySheet';

export function QuickEntryButton() {
  const snapshot = useSnapshot();
  const can = useCan();
  const pathname = usePathname();
  const params = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [kind, setKind] = useState<EntryKind | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const oeffneMenu = useCallback(() => setMenuOpen(true), []);
  const { handlers, consumeTriggered } = useLongPress(oeffneMenu);

  // Mit der Tastatur geöffnet, mit der Tastatur bedienbar: Ohne diesen Fokus
  // stände der Fokus weiter auf dem Knopf und der erste Tab ginge irgendwohin.
  useEffect(() => {
    if (menuOpen) firstItemRef.current?.focus();
  }, [menuOpen]);

  const scope = scopeForPath(pathname);

  if (!can('entry.create')) return null;
  if (!fabVisibleOnPath(pathname)) return null;

  const activePots = bookablePots(snapshot.pots);

  /**
   * Der Topf aus der Adresse, aber nur dort, wo er etwas bedeutet. Ein
   * `?pot=` auf einer anderen Seite ist kein Auftrag, und ein archivierter
   * Topf steht nicht zur Wahl. Als `Pot` und nicht nur als Kennung, damit
   * `resolveGoalFabAction` seine Art lesen kann.
   */
  const potAusAdresse = scope === 'potDetail' ? (params.get('pot') ?? null) : null;
  const zielTopf =
    potAusAdresse !== null ? (activePots.find((pot) => pot.id === potAusAdresse) ?? null) : null;
  const defaultPotId = zielTopf?.id ?? null;

  const action = resolveGoalFabAction(resolveFabAction(snapshot.household, scope), zielTopf);
  const fabActionLabel =
    action === 'ask' ? fabLabel('ask') : entryKindActionLabel(action, zielTopf);
  const aufSparziel = goalPhaseOf(zielTopf) !== null;

  function schliesseMenu(zurueckZumKnopf = true) {
    setMenuOpen(false);
    if (zurueckZumKnopf) buttonRef.current?.focus();
  }

  function starte(gewaehlt: EntryKind) {
    setMenuOpen(false);
    setChooserOpen(false);
    setKind(gewaehlt);
  }

  function tippen() {
    // Langes Drücken hat schon ausgelöst — das `click` danach würde die
    // Standardaktion obendrauf öffnen.
    if (consumeTriggered()) return;
    // Der Knopf liegt über der Wegtipp-Fläche und ist deshalb auch bei
    // offenem Menü erreichbar; dann schließt er es, statt zu erfassen.
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    if (action === 'ask') setChooserOpen(true);
    else starte(action);
  }

  return (
    <>
      {menuOpen && (
        <>
          {/*
            Die Fläche zum Wegtippen. Kein `Sheet` und damit keine
            Scrollsperre: Das Menü ist klein, hängt am Knopf und soll beim
            Antippen daneben schlicht verschwinden.
          */}
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => schliesseMenu(false)}
            className="fixed inset-0 z-40 cursor-default md:hidden"
          />
          <div
            role="menu"
            aria-label="Was erfassen?"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                schliesseMenu();
              }
            }}
            className={[
              'fixed right-4 z-40 flex flex-col items-end gap-2 md:hidden',
              // Über dem Knopf: dessen Unterkante plus Höhe plus Abstand.
              'bottom-[calc(4.75rem+3.5rem+0.75rem+env(safe-area-inset-bottom))]',
            ].join(' ')}
          >
            <MenuRow
              ref={firstItemRef}
              icon={PiggyBank}
              label={entryKindLabel('income', zielTopf)}
              onClick={() => starte('income')}
            />
            <MenuRow
              icon={ShoppingCart}
              label={entryKindLabel('expense', zielTopf)}
              onClick={() => starte('expense')}
            />
          </div>
        </>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={tippen}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
        {...handlers}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        /*
          „für mehr" und nicht „für weitere": Der Name eines Knopfes wird in
          Tests und von Screenreadern als Text gesucht, und „weitere" enthält
          „Weiter" — denselben Namen, den jeder Schritt im Erfassen-Sheet
          trägt. Ein Wort, das eine Verwechslung einbaut, ist das falsche Wort.
        */
        aria-label={`${fabActionLabel} — lang drücken für mehr`}
        className={[
          'fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full md:hidden',
          // Über der unteren Leiste, samt Geräte-Sicherheitsbereich.
          'bottom-[calc(4.75rem+env(safe-area-inset-bottom))]',
          'bg-accent text-accent-ink',
          // Keine Textauswahl und keine Lupe beim langen Drücken: Beides
          // legte sich auf Android über das eigene Menü.
          'touch-manipulation select-none',
          'shadow-lg active:opacity-85',
        ].join(' ')}
      >
        <Icon icon={Plus} size={26} />
      </button>

      <Sheet
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        title="Was möchtest du erfassen?"
      >
        <div className="flex flex-col gap-2">
          <ChoiceRow
            icon={ShoppingCart}
            label={entryKindLabel('expense', zielTopf)}
            hint={aufSparziel ? 'Erhöht das Gesparte' : 'Geht von einem Topf ab'}
            onClick={() => starte('expense')}
          />
          <ChoiceRow
            icon={PiggyBank}
            label={entryKindLabel('income', zielTopf)}
            hint={aufSparziel ? 'Nimmt vom Gesparten' : 'Kommt dem Haushalt zu'}
            onClick={() => starte('income')}
          />
        </div>
      </Sheet>

      <EntrySheet
        open={kind !== null}
        onClose={() => setKind(null)}
        pots={activePots}
        defaultKind={kind ?? 'expense'}
        defaultPotId={defaultPotId}
        lockKind
      />
    </>
  );
}

/**
 * Eine Zeile des Menüs: Beschriftung links, Symbol rechts.
 *
 * Die Reihenfolge ist nicht Geschmack — das Symbol steht senkrecht über dem
 * Knopf, den man gerade drückt, und der Text liest sich von dort nach links
 * weg. Umgekehrt läge er unter dem Daumen.
 */
function MenuRow({
  ref,
  icon,
  label,
  onClick,
}: {
  ref?: Ref<HTMLButtonElement>;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-3"
    >
      <span className="rounded-lg bg-surface px-2.5 py-1 text-sm font-medium shadow-md">
        {label}
      </span>
      <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-ink shadow-lg">
        <Icon icon={icon} size={20} />
      </span>
    </button>
  );
}

function ChoiceRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: LucideIcon;
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
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle">
        <Icon icon={icon} size={20} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
    </button>
  );
}
