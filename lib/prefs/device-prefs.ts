/**
 * Einstellungen, die zum Gerät gehören — nicht zum Haushalt.
 *
 * Warum `localStorage` und nicht der Haushalt-Datensatz in IndexedDB, obwohl
 * `updateHousehold` beliebige Felder nimmt:
 *
 * 1. Die Darstellung muss **vor dem ersten Rendern** stehen. Der Snapshot lädt
 *    asynchron unterhalb von `AppGate`; aus der Datenbank gelesen würde bei
 *    jedem Start kurz das helle Thema aufblitzen.
 * 2. Beides ist eine Bedienvorliebe dieses Geräts. In einer Sicherung und in
 *    einem späteren Sync hat sie nichts zu suchen — sonst stellt ein Import
 *    vom Telefon den Dunkelmodus am Desktop um.
 *
 * Der Preis, ehrlich benannt: Die Wahl gilt pro Gerät und ist weg, wenn die
 * Website-Daten gelöscht werden. Für eine Anzeigeeinstellung ist das richtig.
 *
 * Aufgebaut wie `lib/auth/local-credentials.ts`: Zugriffe in `try/catch`, weil
 * `localStorage` im privaten Modus werfen kann, und eigene Listener zusätzlich
 * zum `storage`-Event, das nur in *anderen* Tabs feuert.
 *
 * Seit den Themes steht am Wurzelelement **der aufgelöste Modus**
 * (`data-mode="light|dark"`) und nicht mehr die Wahl selbst. Der Grund steht
 * im Kopf von `app/themes.css`: Sonst bräuchte jede Palette zwei Blöcke, einen
 * für „Automatisch“ im `@media` und einen für die ausdrückliche Wahl.
 */

import {
  ACCENT_NAMES,
  AMOLED_BAR_COLOR,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  THEMES,
  THEME_NAMES,
  resolveAccent,
  type AccentName,
  type ThemeName,
} from '../ui/themes';

/** Die Wahl des Nutzers — `'system'` folgt dem Betriebssystem. */
export type ThemeChoice = 'system' | 'light' | 'dark';
/** Der daraus aufgelöste Modus. Nur er landet im DOM und im CSS. */
export type ResolvedMode = 'light' | 'dark';
export type AmountMode = 'cents' | 'free';
/** Strichstärke der Icons — übersetzt in `strokeWidth`, siehe `lib/ui/Icon.tsx`. */
export type IconStyle = 'thin' | 'normal' | 'bold';

export const THEME_KEY = 'haushalt.theme';
export const AMOUNT_MODE_KEY = 'haushalt.amountMode';
export const THEME_LIGHT_KEY = 'haushalt.themeLight';
export const THEME_DARK_KEY = 'haushalt.themeDark';
export const ACCENT_KEY = 'haushalt.accent';
export const ICON_STYLE_KEY = 'haushalt.iconStyle';
export const AMOLED_KEY = 'haushalt.amoled';

const ALL_KEYS: readonly string[] = [
  THEME_KEY,
  AMOUNT_MODE_KEY,
  THEME_LIGHT_KEY,
  THEME_DARK_KEY,
  ACCENT_KEY,
  ICON_STYLE_KEY,
  AMOLED_KEY,
];

const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];
const AMOUNT_MODES: readonly AmountMode[] = ['cents', 'free'];
const ICON_STYLES: readonly IconStyle[] = ['thin', 'normal', 'bold'];
const FLAGS = ['on', 'off'] as const;

function readKey<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeKey(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ohne Speicher gilt die Wahl nur für diese Sitzung.
  }
  notify();
}

export function getThemeChoice(): ThemeChoice {
  return readKey(THEME_KEY, THEME_CHOICES, 'system');
}

export function getAmountMode(): AmountMode {
  return readKey(AMOUNT_MODE_KEY, AMOUNT_MODES, 'cents');
}

export function getIconStyle(): IconStyle {
  return readKey(ICON_STYLE_KEY, ICON_STYLES, 'normal');
}

export function getAmoled(): boolean {
  return readKey(AMOLED_KEY, FLAGS, 'off') === 'on';
}

export function getThemeFor(mode: ResolvedMode): ThemeName {
  return readKey(mode === 'dark' ? THEME_DARK_KEY : THEME_LIGHT_KEY, THEME_NAMES, DEFAULT_THEME);
}

export function getAccent(): AccentName {
  return readKey(ACCENT_KEY, ACCENT_NAMES, DEFAULT_ACCENT);
}

/** Der ganze Zustand der Darstellung, wie ihn `applyAppearance` braucht. */
export interface Appearance {
  choice: ThemeChoice;
  mode: ResolvedMode;
  /** Das Theme des aufgelösten Modus — das, was gerade gilt. */
  theme: ThemeName;
  /**
   * Beide gespeicherten Themes. Die Seite „Darstellung“ zeigt die Wahl für
   * hell und dunkel gleichzeitig; nur den aktiven zu kennen reichte nicht.
   */
  themeLight: ThemeName;
  themeDark: ThemeName;
  accent: AccentName;
  amoled: boolean;
}

/** Die eine Meta-Angabe, die diese Datei pflegt. */
const THEME_META_ID = 'theme-color';

function prefersDark(choice: ThemeChoice): boolean {
  if (choice === 'dark') return true;
  if (choice === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getAppearance(): Appearance {
  const choice = getThemeChoice();
  const mode: ResolvedMode = prefersDark(choice) ? 'dark' : 'light';
  const themeLight = getThemeFor('light');
  const themeDark = getThemeFor('dark');
  const theme = mode === 'dark' ? themeDark : themeLight;
  return {
    choice,
    mode,
    theme,
    themeLight,
    themeDark,
    // Der gespeicherte Akzent kann zu einem Theme gehören, das nicht mehr
    // gewählt ist — dann zeigt das Theme seinen ersten.
    accent: resolveAccent(theme, getAccent()),
    amoled: mode === 'dark' && getAmoled(),
  };
}

export function barColorOf(appearance: Appearance): string {
  if (appearance.amoled) return AMOLED_BAR_COLOR;
  const info = THEMES.find((theme) => theme.name === appearance.theme) ?? THEMES[0]!;
  return info.barColor[appearance.mode];
}

/**
 * Hält genau **eine** `<meta name="theme-color">` im Dokument.
 *
 * `app/layout.tsx` exportiert bewusst keine mehr: Zwei Angaben mit
 * `prefers-color-scheme` können eine ausdrückliche Wahl nicht ausdrücken, und
 * der Client-Router fügt sie nach einem Seitenwechsel erneut ein — beim Prüfen
 * standen danach drei im Dokument, eine mit der alten Farbe. Der Browser nimmt
 * die erste passende; das wäre Glücksspiel. Also eine, und alles andere weg.
 */
function syncThemeColor(appearance: Appearance): void {
  let meta = document.getElementById(THEME_META_ID);
  if (!(meta instanceof HTMLMetaElement)) {
    meta = document.createElement('meta');
    meta.id = THEME_META_ID;
    (meta as HTMLMetaElement).name = 'theme-color';
    document.head.appendChild(meta);
  }
  (meta as HTMLMetaElement).content = barColorOf(appearance);

  for (const other of document.querySelectorAll('meta[name="theme-color"]')) {
    if (other !== meta) other.remove();
  }
}

let mediaBound = false;

/** Bei „Automatisch“ soll ein Systemwechsel Theme und Statusleiste mitnehmen. */
function bindSystemTheme(): void {
  if (mediaBound || typeof window === 'undefined') return;
  mediaBound = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemeChoice() !== 'system') return;
    applyAppearance(getAppearance());
    // Die Oberfläche muss mitziehen: Welches Theme auf der Seite „Darstellung“
    // markiert ist, hängt am aufgelösten Modus.
    notify();
  });
}

/**
 * Schreibt die vier Attribute, die `app/themes.css` auswertet.
 *
 * `data-amoled` ist ein Attribut ohne Wert — genauso liest es der Selektor
 * `[data-amoled]`, und `delete dataset.amoled` entfernt es wieder.
 */
export function applyAppearance(appearance: Appearance): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.mode = appearance.mode;
  root.dataset.theme = appearance.theme;
  root.dataset.accent = appearance.accent;
  if (appearance.amoled) root.dataset.amoled = '';
  else delete root.dataset.amoled;

  syncThemeColor(appearance);
  bindSystemTheme();
}

/** Nach jeder Änderung: speichern, dann anwenden — nie nur eines von beidem. */
function persist(key: string, value: string): void {
  writeKey(key, value);
  applyAppearance(getAppearance());
}

export function setThemeChoice(choice: ThemeChoice): void {
  persist(THEME_KEY, choice);
}

/**
 * Setzt das Theme für einen Modus.
 *
 * Und räumt den Akzent mit auf: Wer von Cyberpunk auf Pastell wechselt, hat
 * Magenta gespeichert, das Pastell nicht anbietet. Ohne diese Zeile stünde in
 * der Auswahl nichts markiert.
 */
export function setThemeFor(mode: ResolvedMode, theme: ThemeName): void {
  writeKey(mode === 'dark' ? THEME_DARK_KEY : THEME_LIGHT_KEY, theme);
  const accent = resolveAccent(theme, getAccent());
  if (accent !== getAccent()) writeKey(ACCENT_KEY, accent);
  applyAppearance(getAppearance());
}

export function setAccent(accent: AccentName): void {
  persist(ACCENT_KEY, accent);
}

export function setIconStyle(style: IconStyle): void {
  persist(ICON_STYLE_KEY, style);
}

export function setAmoled(on: boolean): void {
  persist(AMOLED_KEY, on ? 'on' : 'off');
}

export function setAmountMode(mode: AmountMode): void {
  writeKey(AMOUNT_MODE_KEY, mode);
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Abo-Quelle für `useSyncExternalStore` — eigener Tab und fremde Tabs. */
export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || ALL_KEYS.includes(event.key)) listener();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Das Skript, das vor dem ersten Rendern läuft.
 *
 * Steht hier und nicht als Zeichenkette in `app/layout.tsx`, damit die
 * Schlüsselnamen nur an einer Stelle vorkommen; die Tabelle der
 * Statusleistenfarben erzeugt es aus `lib/ui/themes.ts`, damit eine neue
 * Palette nicht an zwei Stellen nachgetragen werden muss.
 *
 * Bewusst winzig und in `try/catch`: Es blockiert das Rendern, und ein Fehler
 * darf die Seite nicht anhalten. Es prüft die gelesenen Werte gegen die
 * erlaubten — ein Tippfehler im `localStorage` setzte sonst ein Attribut, auf
 * das keine Regel passt, und die Seite stünde ohne Farben da.
 *
 * Die Akzent-Prüfung läuft hier **je Theme** und damit genauso wie
 * `resolveAccent`. Zwei verschiedene Regeln wären ein Wechsel der Farbe beim
 * Hydrieren: das Skript setzte den gespeicherten Akzent, die Oberfläche
 * markierte einen anderen.
 */
export const THEME_BOOTSTRAP_SCRIPT = (() => {
  const bars = JSON.stringify(
    Object.fromEntries(
      THEMES.map((theme) => [theme.name, [theme.barColor.light, theme.barColor.dark]]),
    ),
  );
  const accents = JSON.stringify(
    Object.fromEntries(THEMES.map((theme) => [theme.name, theme.accents.join(' ')])),
  );

  return `try{var S=localStorage,B=${bars},A=${accents};
var c=S.getItem('${THEME_KEY}'),d=c==='dark'||(c!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
var t=S.getItem(d?'${THEME_DARK_KEY}':'${THEME_LIGHT_KEY}');if(!B[t])t='${DEFAULT_THEME}';
var a=S.getItem('${ACCENT_KEY}');if((' '+A[t]+' ').indexOf(' '+a+' ')<0)a=A[t].split(' ')[0];
var o=d&&S.getItem('${AMOLED_KEY}')==='on',r=document.documentElement;
r.dataset.mode=d?'dark':'light';r.dataset.theme=t;r.dataset.accent=a;if(o)r.dataset.amoled='';
var m=document.createElement('meta');m.id='${THEME_META_ID}';m.name='theme-color';
m.content=o?'${AMOLED_BAR_COLOR}':B[t][d?1:0];document.head.appendChild(m);}catch(e){}`.replace(
    /\n/g,
    '',
  );
})();
