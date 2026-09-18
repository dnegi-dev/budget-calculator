'use client';

/**
 * Formatierung aus den Haushaltseinstellungen.
 *
 * Locale und Währung stehen am Haushalt, nicht im Code — sonst müsste für
 * jede andere Währung die halbe Oberfläche angefasst werden.
 */

import { useMemo } from 'react';
import { useSnapshot } from '../data/provider';
import { formatDate } from '../domain/dates';
import { formatCents, formatCentsCompact, formatCentsPlain } from '../domain/money';
import { clampPeriodStartDay } from '../domain/period';
import type { IsoDate } from '../domain/types';

export interface Formatters {
  locale: string;
  currency: string;
  currencySymbol: string;
  periodStartDay: number;
  money: (cents: number) => string;
  moneyCompact: (cents: number) => string;
  moneyPlain: (cents: number) => string;
  day: (date: IsoDate) => string;
}

const FALLBACK = { locale: 'de-DE', currency: 'EUR', periodStartDay: 1 };

export function useFormat(): Formatters {
  const { household } = useSnapshot();

  return useMemo(() => {
    const locale = household?.locale ?? FALLBACK.locale;
    const currency = household?.currency ?? FALLBACK.currency;
    const periodStartDay = clampPeriodStartDay(
      household?.periodStartDay ?? FALLBACK.periodStartDay,
    );

    return {
      locale,
      currency,
      currencySymbol: currencySymbolOf(locale, currency),
      periodStartDay,
      money: (cents) => formatCents(cents, { locale, currency }),
      moneyCompact: (cents) => formatCentsCompact(cents, { locale, currency }),
      moneyPlain: (cents) => formatCentsPlain(cents),
      day: (date) => formatDate(date, locale),
    };
  }, [household?.locale, household?.currency, household?.periodStartDay]);
}

/** '€' aus der Intl-Formatierung ziehen, statt eine Symboltabelle zu pflegen. */
function currencySymbolOf(locale: string, currency: string): string {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
  return parts.find((part) => part.type === 'currency')?.value ?? currency;
}
