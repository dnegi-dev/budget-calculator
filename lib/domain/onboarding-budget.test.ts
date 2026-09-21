import { describe, expect, it } from 'vitest';
import { amountFromIncomePercent, INCOME_PERCENT_SUGGESTIONS } from './onboarding-budget';

describe('amountFromIncomePercent', () => {
  it('rechnet einen Anteil vom Einkommen und rundet auf den vollen Euro', () => {
    expect(amountFromIncomePercent(300_000, INCOME_PERCENT_SUGGESTIONS.lebensmittel)).toBe(45_000);
    expect(amountFromIncomePercent(300_000, INCOME_PERCENT_SUGGESTIONS.hobby)).toBe(15_000);
    // 233_333 * 0.15 = 34_999.95 Cent → 349,9995 € → gerundet 350,00 €.
    expect(amountFromIncomePercent(233_333, 0.15)).toBe(35_000);
  });

  it('ergibt 0 ohne oder mit negativem Einkommen', () => {
    expect(amountFromIncomePercent(0, 0.15)).toBe(0);
    expect(amountFromIncomePercent(-100, 0.15)).toBe(0);
  });
});
