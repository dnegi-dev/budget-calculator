'use client';

/**
 * Darstellung: Modus, Theme je Modus, Akzent, Icon-Stil, echtes Schwarz.
 *
 * Ohne Rechteprüfung, anders als die Haushalt-Einstellungen: Wie die App auf
 * diesem Gerät aussieht, ist keine Haushaltsangelegenheit. Auch wer nur lesen
 * darf, darf dunkel lesen. Warum die Werte im `localStorage` liegen und nicht
 * am Haushalt, steht in `lib/prefs/device-prefs.ts`.
 *
 * Der Kniff bei den Vorschaukacheln: Sie tragen `data-mode`, `data-theme` und
 * `data-accent` **selbst**. Die Selektoren in `app/themes.css` hängen an
 * Attributen und nicht am Wurzelelement, also gelten die Tokens innerhalb der
 * Kachel — und weil `@theme inline` die Tailwind-Farben auf dieselben Tokens
 * abbildet, zeigt `bg-surface` dort die Fläche *dieses* Themes. Die Vorschau
 * ist damit keine nachgebaute Behauptung, sondern die Palette selbst.
 */

import { Bell, Check, Search, type LucideIcon } from 'lucide-react';
import {
  setAccent,
  setAmoled,
  setIconStyle,
  setThemeChoice,
  setThemeFor,
  type IconStyle,
  type ResolvedMode,
  type ThemeChoice,
} from '../../lib/prefs/device-prefs';
import { useAppearance, useIconStyle } from '../../lib/prefs/useDevicePref';
import { Card, CardHeader } from '../../lib/ui/Card';
import { Icon, strokeWidthOf } from '../../lib/ui/Icon';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import {
  ACCENT_LABELS,
  THEMES,
  themeInfo,
  type AccentName,
  type ThemeName,
} from '../../lib/ui/themes';

const MODE_OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

const ICON_OPTIONS: readonly { value: IconStyle; label: string }[] = [
  { value: 'thin', label: 'Dünn' },
  { value: 'normal', label: 'Normal' },
  { value: 'bold', label: 'Fett' },
];

export function AppearanceSection() {
  const appearance = useAppearance();
  const iconStyle = useIconStyle();
  const aktiv = themeInfo(appearance.theme);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Hell oder dunkel" />
        <div className="flex flex-col gap-4 px-4 py-4">
          <div>
            <SegmentedControl
              label="Darstellung"
              value={appearance.choice}
              onChange={setThemeChoice}
              options={MODE_OPTIONS}
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              „Automatisch“ folgt der Einstellung des Betriebssystems — gerade{' '}
              {appearance.mode === 'dark' ? 'dunkel' : 'hell'}.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-muted">Echtes Schwarz</p>
            <SegmentedControl
              label="Echtes Schwarz"
              value={appearance.amoled ? 'on' : 'off'}
              onChange={(next) => setAmoled(next === 'on')}
              disabled={appearance.choice === 'light'}
              options={[
                { value: 'off', label: 'Aus' },
                { value: 'on', label: 'An' },
              ]}
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              {appearance.choice === 'light'
                ? 'Gilt nur im dunklen Modus.'
                : 'Setzt die Grundfläche auf reines Schwarz. Auf OLED-Displays bleiben diese Pixel dunkel — das spart Strom. Die Karten bleiben abgesetzt, sonst verschwinden ihre Kanten.'}
            </p>
          </div>
        </div>
      </Card>

      <ThemeWahl modus="light" appearance={appearance} />
      <ThemeWahl modus="dark" appearance={appearance} />

      <Card>
        <CardHeader title="Akzentfarbe" />
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {aktiv.accents.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setAccent(name)}
                aria-pressed={appearance.accent === name}
                aria-label={ACCENT_LABELS[name]}
                title={ACCENT_LABELS[name]}
                data-mode={appearance.mode}
                data-accent={name}
                className={[
                  'grid h-11 place-items-center rounded-xl border',
                  appearance.accent === name ? 'border-accent' : 'border-line',
                ].join(' ')}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-ink">
                  {appearance.accent === name && <Icon icon={Check} size={14} />}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-muted">
            {ACCENT_LABELS[appearance.accent]} — jedes Theme stellt die Farben zur Wahl, die auf
            seinen Flächen lesbar bleiben. Geprüft wird das nicht nach Gefühl: Ein Test rechnet für
            jede Paarung das Kontrastverhältnis nach.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Symbole" />
        <div className="flex flex-col gap-3 px-4 py-4">
          <SegmentedControl
            label="Strichstärke der Symbole"
            value={iconStyle}
            onChange={setIconStyle}
            options={ICON_OPTIONS}
          />
          <div className="flex justify-between gap-3 rounded-xl bg-subtle px-4 py-3">
            {ICON_OPTIONS.map((option) => (
              <span key={option.value} className="flex flex-col items-center gap-1.5">
                <span className="flex items-center gap-2">
                  {[Search, Bell, Check].map((glyph, index) => (
                    <FesteStaerke
                      key={index}
                      icon={glyph}
                      strokeWidth={strokeWidthOf(option.value)}
                    />
                  ))}
                </span>
                <span className="text-xs text-ink-muted">{option.label}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-ink-muted">
            Gilt für die Bediensymbole. Die Symbole der Töpfe bleiben Emoji — die wählst du selbst,
            und dafür gibt es keinen Icon-Satz.
          </p>
        </div>
      </Card>

      <p className="text-xs text-ink-muted">
        Alles auf dieser Seite gilt nur auf diesem Gerät und steht nicht in der Sicherung.
      </p>
    </div>
  );
}

/** Ein Symbol mit fester Strichstärke — die Vorschau zeigt alle drei nebeneinander. */
function FesteStaerke({ icon: Glyph, strokeWidth }: { icon: LucideIcon; strokeWidth: number }) {
  return <Glyph aria-hidden focusable={false} width={17} height={17} strokeWidth={strokeWidth} />;
}

function ThemeWahl({
  modus,
  appearance,
}: {
  modus: ResolvedMode;
  appearance: ReturnType<typeof useAppearance>;
}) {
  const gewaehlt = modus === 'dark' ? appearance.themeDark : appearance.themeLight;

  return (
    <Card>
      <CardHeader
        title={modus === 'light' ? 'Theme bei hell' : 'Theme bei dunkel'}
        action={
          appearance.mode === modus ? (
            <span className="text-xs text-ink-muted">gilt gerade</span>
          ) : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3">
        {THEMES.map((theme) => (
          <ThemeKachel
            key={theme.name}
            name={theme.name}
            modus={modus}
            gewaehlt={gewaehlt === theme.name}
            accent={appearance.accent}
            amoled={appearance.amoled}
          />
        ))}
      </div>
    </Card>
  );
}

function ThemeKachel({
  name,
  modus,
  gewaehlt,
  accent,
  amoled,
}: {
  name: ThemeName;
  modus: ResolvedMode;
  gewaehlt: boolean;
  accent: AccentName;
  amoled: boolean;
}) {
  const info = themeInfo(name);
  // Der Akzent der Vorschau: der gewählte, wenn dieses Theme ihn anbietet,
  // sonst sein erster — genau das tut `resolveAccent` beim Umschalten.
  const vorschauAccent = info.accents.includes(accent) ? accent : info.accents[0]!;

  return (
    <button
      type="button"
      onClick={() => setThemeFor(modus, name)}
      aria-pressed={gewaehlt}
      className={[
        'flex flex-col gap-1.5 rounded-xl border p-2 text-left',
        gewaehlt ? 'border-accent' : 'border-line hover:border-line-strong',
      ].join(' ')}
    >
      <span
        aria-hidden
        data-mode={modus}
        data-theme={name}
        data-accent={vorschauAccent}
        {...(amoled && modus === 'dark' ? { 'data-amoled': '' } : {})}
        className="flex h-16 w-full flex-col justify-between rounded-lg bg-bg p-1.5"
      >
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-full bg-accent" />
          <span className="h-1.5 flex-1 rounded-full bg-line-strong" />
        </span>
        <span className="flex flex-col gap-1 rounded-md bg-surface p-1.5">
          <span className="h-1.5 w-3/4 rounded-full bg-ink" />
          <span className="h-1.5 w-1/2 rounded-full bg-ink-muted" />
        </span>
      </span>
      <span className="block text-sm font-medium">{info.label}</span>
      <span className="block text-xs text-ink-muted">{info.hint}</span>
    </button>
  );
}
