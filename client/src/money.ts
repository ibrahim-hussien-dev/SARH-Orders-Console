export const CURRENCY = 'USD';

const MONEY_PATTERN = /^(\d+)(?:\.(\d+))?$/;
const MAX_WHOLE_DIGITS = 9;
const MAX_FRACTION_DIGITS = 2;

export type MoneyParseFailure = 'empty' | 'format' | 'too_many_decimals' | 'too_large';

export type MoneyParseResult =
  | { ok: true; cents: number }
  | { ok: false; reason: MoneyParseFailure };

export function parseMoneyToCents(input: string): MoneyParseResult {
  const text = input.trim();
  if (text === '') {
    return { ok: false, reason: 'empty' };
  }
  const match = MONEY_PATTERN.exec(text);
  if (match === null) {
    return { ok: false, reason: 'format' };
  }
  const whole = (match[1] ?? '').replace(/^0+(?=\d)/, '');
  const fraction = match[2] ?? '';
  if (fraction.length > MAX_FRACTION_DIGITS) {
    return { ok: false, reason: 'too_many_decimals' };
  }
  if (whole.length > MAX_WHOLE_DIGITS) {
    return { ok: false, reason: 'too_large' };
  }
  const fractionCents = Number(fraction.padEnd(MAX_FRACTION_DIGITS, '0'));
  return { ok: true, cents: Number(whole) * 100 + fractionCents };
}

export function centsToDecimalString(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
});

export function formatMoney(cents: number): string {
  return currencyFormatter.format(cents / 100);
}
