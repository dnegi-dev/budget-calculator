/**
 * Geld. Intern ausschließlich Integer-Cent.
 *
 * Grund: 0.1 + 0.2 !== 0.3 in IEEE-754. Bei Budgets fällt das erst nach
 * dreißig Buchungen als fehlender Cent auf — und dann ist nicht mehr
 * nachvollziehbar, wo er verloren ging.
 */

export const CENTS_PER_UNIT = 100;

/**
 * Nutzereingabe zu Cent. Gibt `null` zurück, wenn die Eingabe kein Betrag ist.
 *
 * Akzeptiert deutsche und englische Schreibweise ('12,50', '12.50', '1.234,56',
 * '1,234.56') sowie Währungssymbole und Leerzeichen. Bei mehreren Trennzeichen
 * gilt das letzte als Dezimaltrenner, wenn ihm eine oder zwei Ziffern folgen;
 * sonst wird es als Tausendertrenner gelesen.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input
    .replace(/[\s '€$£]/g, '')
    .replace(/^\+/, '')
    .trim();
  if (cleaned === '' || cleaned === '-') return null;

  const negative = cleaned.startsWith('-');
  const digitsAndSeparators = negative ? cleaned.slice(1) : cleaned;
  if (!/^[\d.,]+$/.test(digitsAndSeparators)) return null;

  const lastSeparator = Math.max(
    digitsAndSeparators.lastIndexOf(','),
    digitsAndSeparators.lastIndexOf('.'),
  );

  let integerPart: string;
  let fractionPart: string;

  if (lastSeparator === -1) {
    integerPart = digitsAndSeparators;
    fractionPart = '';
  } else {
    const tail = digitsAndSeparators.slice(lastSeparator + 1);
    if (tail.length === 1 || tail.length === 2) {
      integerPart = digitsAndSeparators.slice(0, lastSeparator);
      fractionPart = tail;
    } else {
      // Drei Nachziffern: Tausendertrenner, kein Dezimaltrenner.
      integerPart = digitsAndSeparators;
      fractionPart = '';
    }
  }

  integerPart = integerPart.replace(/[.,]/g, '');
  if (integerPart === '') integerPart = '0';
  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fractionPart)) return null;

  const cents =
    Number(integerPart) * CENTS_PER_UNIT + Number(fractionPart.padEnd(2, '0').slice(0, 2));
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

export interface MoneyFormat {
  locale: string;
  currency: string;
}

/** '12,50 €' */
export function formatCents(cents: number, { locale, currency }: MoneyFormat): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(cents / CENTS_PER_UNIT);
}

/** '12,50 €' ohne Nachkommastellen, wenn der Betrag glatt ist — für Kennzahlen. */
export function formatCentsCompact(cents: number, { locale, currency }: MoneyFormat): string {
  const glatt = cents % CENTS_PER_UNIT === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: glatt ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / CENTS_PER_UNIT);
}

/** '12,50' — für Eingabefelder und CSV mit deutschem Dezimalzeichen. */
export function formatCentsPlain(cents: number, decimalSeparator: ',' | '.' = ','): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const units = Math.floor(absolute / CENTS_PER_UNIT);
  const rest = absolute % CENTS_PER_UNIT;
  return `${negative ? '-' : ''}${units}${decimalSeparator}${String(rest).padStart(2, '0')}`;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Vorzeichenbehafteter Betrag einer Buchung: Ausgaben negativ, Einnahmen positiv. */
export function signedCents(kind: 'expense' | 'income', amountCents: number): number {
  return kind === 'expense' ? -amountCents : amountCents;
}

/**
 * Das Vorzeichen vor einem Betrag in einer Liste. Echtes Minus (U+2212), nicht
 * der Bindestrich — in tabellarischen Ziffern ist es so breit wie das Plus.
 */
export function signSymbol(kind: 'expense' | 'income'): '+' | '−' {
  return kind === 'income' ? '+' : '−';
}

/** Obergrenze der Ziffernfolge im Kassenzettel-Modus: 9 999 999,99 €. */
export const MAX_AMOUNT_DIGITS = 9;

/**
 * Kassenzettel-Modus: Ziffernfolge zu Anzeige.
 *
 * `''` → `''`, `'1'` → `'0,01'`, `'1250'` → `'12,50'`. Die letzten zwei
 * Ziffern sind Cent, wie an einer Registrierkasse. Damit muss niemand ein
 * Komma tippen, und es gibt während der Eingabe keinen ungültigen Zustand.
 *
 * Alles außer Ziffern wird verworfen — auch ein getipptes Komma, das sonst
 * zwei konkurrierende Dezimalzeichen im Feld hinterließe.
 */
export function formatDigitsAsAmount(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, MAX_AMOUNT_DIGITS);
  if (digits === '') return '';
  const padded = digits.padStart(3, '0');
  return `${String(Number(padded.slice(0, -2)))},${padded.slice(-2)}`;
}
