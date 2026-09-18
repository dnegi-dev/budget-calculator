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
 */

export type ThemeChoice = 'system' | 'light' | 'dark';
export type AmountMode = 'cents' | 'free';

export const THEME_KEY = 'haushalt.theme';
export const AMOUNT_MODE_KEY = 'haushalt.amountMode';

/**
 * Dieselben Farben wie `--bg` in `app/globals.css` und wie der
 * `themeColor`-Export in `app/layout.tsx`. Bewusst als Hex dupliziert: Die
 * Tokens sind `oklch()`, und darauf verlässt sich `<meta name="theme-color">`
 * nicht in jedem Browser.
 */
const THEME_COLORS: Record<'light' | 'dark', string> = {
  light: '#fbfbfd',
  dark: '#1b1d22',
};

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

const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark'];
const AMOUNT_MODES: readonly AmountMode[] = ['cents', 'free'];

export function getTheme(): ThemeChoice {
  return readKey(THEME_KEY, THEMES, 'system');
}

export function getAmountMode(): AmountMode {
  return readKey(AMOUNT_MODE_KEY, AMOUNT_MODES, 'cents');
}

/** Die eine Meta-Angabe, die diese Datei pflegt. */
const THEME_META_ID = 'theme-color';

function prefersDark(choice: ThemeChoice): boolean {
  if (choice === 'dark') return true;
  if (choice === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
function syncThemeColor(choice: ThemeChoice): void {
  let meta = document.getElementById(THEME_META_ID);
  if (!(meta instanceof HTMLMetaElement)) {
    meta = document.createElement('meta');
    meta.id = THEME_META_ID;
    (meta as HTMLMetaElement).name = 'theme-color';
    document.head.appendChild(meta);
  }
  (meta as HTMLMetaElement).content = prefersDark(choice) ? THEME_COLORS.dark : THEME_COLORS.light;

  for (const other of document.querySelectorAll('meta[name="theme-color"]')) {
    if (other !== meta) other.remove();
  }
}

let mediaBound = false;

/** Bei „Automatisch“ soll ein Systemwechsel auch die Statusleiste mitnehmen. */
function bindSystemTheme(): void {
  if (mediaBound || typeof window === 'undefined') return;
  mediaBound = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') syncThemeColor('system');
  });
}

/**
 * Setzt `data-theme` am Wurzelelement und zieht `theme-color` nach.
 *
 * `app/globals.css` wertet `[data-theme='light'|'dark']` bereits aus; ohne
 * diese Zeile war das totes CSS.
 */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;

  syncThemeColor(choice);
  bindSystemTheme();
}

export function setTheme(choice: ThemeChoice): void {
  applyTheme(choice);
  writeKey(THEME_KEY, choice);
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
    if (event.key === null || event.key === THEME_KEY || event.key === AMOUNT_MODE_KEY) listener();
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
 * Steht hier und nicht als Zeichenkette in `app/layout.tsx`, damit der
 * Schlüsselname nur an einer Stelle vorkommt. Bewusst winzig und in
 * `try/catch`: Es blockiert das Rendern, und ein Fehler darf die Seite nicht
 * anhalten.
 */
export const THEME_BOOTSTRAP_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var m=document.createElement('meta');m.id='${THEME_META_ID}';m.name='theme-color';m.content=d?'${THEME_COLORS.dark}':'${THEME_COLORS.light}';document.head.appendChild(m);}catch(e){}`;
