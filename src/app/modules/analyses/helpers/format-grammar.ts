/**
 * format-grammar — a VBA / d3-style value formatter for the Analyses
 * visual layer (Wave 2, TYPE-SEMANTICS).
 *
 * `formatValue(value, fmt)` turns a raw cell (number | string | Date | null)
 * into a display string according to a `ValueFormat` spec (the shape defined
 * in models/visual-config.model.ts). It is the single place axis labels, data
 * labels and tooltips route their numbers/dates through so a chart's
 * "Currency, 2dp, $, millions" formatting is applied consistently everywhere.
 *
 * Design rules:
 *   - Pure function, no Angular, no external dependency. Uses the browser's
 *     Intl.NumberFormat for grouping/decimals/currency (guarded with a
 *     try/catch fallback for exotic runtimes) and a hand-rolled date
 *     tokenizer (no date-fns / moment).
 *   - Never throws. Any unexpected input degrades to a best-effort String().
 *   - An undefined `fmt`, or `kind: 'auto'`, means "no explicit format" — the
 *     value is rendered with sensible defaults (numbers grouped, dates ISO),
 *     matching the transform layer's prior behaviour closely enough not to
 *     surprise existing charts.
 */

import { DisplayUnit, ValueFormat } from '../models/visual-config.model';

/** Scale factor + suffix for each display unit. */
interface UnitScale {
  factor: number;
  suffix: string;
}

/**
 * Explicit display-unit scales. `auto` is resolved per-value in
 * `resolveAutoUnit` from the magnitude; `none` is the identity.
 */
const UNIT_SCALES: Record<Exclude<DisplayUnit, 'auto'>, UnitScale> = {
  none: { factor: 1, suffix: '' },
  thousands: { factor: 1e3, suffix: 'K' },
  millions: { factor: 1e6, suffix: 'M' },
  billions: { factor: 1e9, suffix: 'B' },
  trillions: { factor: 1e12, suffix: 'T' },
};

/**
 * Pick a K/M/B/T scale for `auto` display unit from the absolute magnitude.
 * < 1000 stays un-scaled so small values read naturally.
 */
function resolveAutoUnit(abs: number): UnitScale {
  if (abs >= 1e12) return UNIT_SCALES.trillions;
  if (abs >= 1e9) return UNIT_SCALES.billions;
  if (abs >= 1e6) return UNIT_SCALES.millions;
  if (abs >= 1e3) return UNIT_SCALES.thousands;
  return UNIT_SCALES.none;
}

/** Coerce an arbitrary value to a finite number, or null when it isn't one. */
function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Group + fixed-decimals a number via Intl.NumberFormat, falling back to
 * toFixed + manual grouping if Intl is unavailable. `thousands=false`
 * disables the group separator.
 */
function formatNumberCore(
  n: number,
  decimals: number | undefined,
  thousands: boolean | undefined,
): string {
  const useGrouping = thousands !== false; // default on
  const opts: Intl.NumberFormatOptions = { useGrouping };
  if (typeof decimals === 'number' && decimals >= 0) {
    opts.minimumFractionDigits = decimals;
    opts.maximumFractionDigits = decimals;
  }
  try {
    return new Intl.NumberFormat(undefined, opts).format(n);
  } catch {
    // Fallback: fixed decimals + naive thousands grouping.
    const fixed =
      typeof decimals === 'number' && decimals >= 0
        ? n.toFixed(decimals)
        : String(n);
    if (!useGrouping) return fixed;
    const [intPart, fracPart] = fixed.split('.');
    const sign = intPart.startsWith('-') ? '-' : '';
    const digits = sign ? intPart.slice(1) : intPart;
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fracPart ? `${sign}${grouped}.${fracPart}` : `${sign}${grouped}`;
  }
}

/** Currency via Intl; falls back to symbol-prefixed number on failure. */
function formatCurrencyCore(
  n: number,
  currencyCode: string | undefined,
  decimals: number | undefined,
  thousands: boolean | undefined,
): string {
  const code = (currencyCode || 'USD').toUpperCase();
  const useGrouping = thousands !== false;
  try {
    const opts: Intl.NumberFormatOptions = {
      style: 'currency',
      currency: code,
      useGrouping,
    };
    if (typeof decimals === 'number' && decimals >= 0) {
      opts.minimumFractionDigits = decimals;
      opts.maximumFractionDigits = decimals;
    }
    return new Intl.NumberFormat(undefined, opts).format(n);
  } catch {
    // Unknown currency code / no Intl — prefix the code and format plainly.
    return `${code} ${formatNumberCore(n, decimals ?? 2, thousands)}`;
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Date tokenizer
 * ──────────────────────────────────────────────────────────────────────── */

/** Coerce a value to a valid Date, or null. Accepts Date, epoch ms, ISO/parsable string. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Left-pad a number to `len` with leading zeros. */
function pad(n: number, len = 2): string {
  return String(Math.abs(n)).padStart(len, '0');
}

/**
 * Apply a date pattern to a Date. Supported tokens (longest matched first so
 * yyyy beats yy, MMMM beats MMM beats MM beats M, etc.):
 *
 *   yyyy  4-digit year        yy   2-digit year
 *   MMMM  full month name     MMM  short month name
 *   MM    2-digit month       M    month (no pad)
 *   dd    2-digit day         d    day (no pad)
 *   HH    2-digit hour(24)    H    hour(24)
 *   hh    2-digit hour(12)    h    hour(12)
 *   mm    2-digit minute      m    minute
 *   ss    2-digit second      s    second
 *   a     AM/PM
 *
 * Anything outside a token (separators, literals) is preserved verbatim.
 * Uses LOCAL date parts (matches the calendar controls elsewhere).
 */
export function formatDatePattern(date: Date, pattern: string): string {
  const y = date.getFullYear();
  const mo = date.getMonth(); // 0-11
  const day = date.getDate();
  const h24 = date.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = date.getMinutes();
  const sec = date.getSeconds();

  // Ordered longest-first so greedy matching picks the widest token.
  const tokens: Array<[string, () => string]> = [
    ['yyyy', () => pad(y, 4)],
    ['yy', () => pad(y % 100)],
    ['MMMM', () => MONTHS_LONG[mo]],
    ['MMM', () => MONTHS_SHORT[mo]],
    ['MM', () => pad(mo + 1)],
    ['M', () => String(mo + 1)],
    ['dd', () => pad(day)],
    ['d', () => String(day)],
    ['HH', () => pad(h24)],
    ['H', () => String(h24)],
    ['hh', () => pad(h12)],
    ['h', () => String(h12)],
    ['mm', () => pad(min)],
    ['m', () => String(min)],
    ['ss', () => pad(sec)],
    ['s', () => String(sec)],
    ['a', () => (h24 < 12 ? 'AM' : 'PM')],
  ];

  let out = '';
  let i = 0;
  while (i < pattern.length) {
    let matched = false;
    for (const [token, render] of tokens) {
      if (pattern.startsWith(token, i)) {
        out += render();
        i += token.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += pattern[i];
      i += 1;
    }
  }
  return out;
}

/** ISO-ish default date rendering when no pattern is supplied. */
function defaultDateString(date: Date): string {
  return formatDatePattern(date, 'yyyy-MM-dd');
}

/* ────────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Format a raw value to a display string according to `fmt`.
 *
 *   formatValue(1500000, { kind:'currency', currencyCode:'USD', displayUnit:'millions', decimals:1 })
 *     → "$1.5M"  (symbol from Intl, scaled to millions, 1dp, unit suffix)
 *   formatValue(0.1234, { kind:'percent', decimals:1 })            → "12.3%"
 *   formatValue(1234.5, { kind:'number', decimals:0 })             → "1,235"
 *   formatValue('2024-04-01', { kind:'date', dateFormat:'MMM yyyy' }) → "Apr 2024"
 *   formatValue(null, { nullText:'—' })                            → "—"
 *
 * Rules:
 *   - null / undefined / '' → `fmt?.nullText ?? ''`.
 *   - `formatString` (raw override) short-circuits: if the value is a date it
 *     is treated as a date pattern, otherwise it wraps a plainly-formatted
 *     number as `formatString` with a `{}` placeholder (or is returned as-is
 *     when it has no placeholder — a passthrough literal is rarely useful, so
 *     the number is appended).
 *   - `prefix` / `suffix` wrap the final formatted body for every kind.
 *   - A value that cannot be coerced to a number (for a numeric kind) falls
 *     back to its string form so category-ish values never vanish.
 */
export function formatValue(
  value: number | string | Date | null | undefined,
  fmt?: ValueFormat,
): string {
  // Null-ish → configured null text (empty string by default).
  if (value === null || value === undefined || value === '') {
    return fmt?.nullText ?? '';
  }

  const prefix = fmt?.prefix ?? '';
  const suffix = fmt?.suffix ?? '';
  const wrap = (body: string) => `${prefix}${body}${suffix}`;

  const kind = fmt?.kind ?? 'auto';

  // ── Raw format-string override ──
  if (fmt?.formatString) {
    const asDate = kind === 'date' ? toDate(value) : null;
    if (asDate) return wrap(formatDatePattern(asDate, fmt.formatString));
    const n = toFiniteNumber(value);
    if (n !== null) {
      const plain = formatNumberCore(n, fmt.decimals, fmt.thousands);
      return wrap(
        fmt.formatString.includes('{}')
          ? fmt.formatString.replace('{}', plain)
          : `${fmt.formatString}${plain}`,
      );
    }
    return wrap(String(value));
  }

  // ── Date kind ──
  if (kind === 'date') {
    const d = toDate(value);
    if (!d) return wrap(String(value));
    return wrap(
      fmt?.dateFormat
        ? formatDatePattern(d, fmt.dateFormat)
        : defaultDateString(d),
    );
  }

  // ── Numeric kinds (number / currency / percent / scientific / auto) ──
  const num = toFiniteNumber(value);
  if (num === null) {
    // Not numeric — for 'auto' this is a category/date string. Try a date,
    // else return the raw string so labels aren't dropped.
    const d = toDate(value);
    if (d && kind === 'auto') return wrap(defaultDateString(d));
    return wrap(String(value));
  }

  switch (kind) {
    case 'currency': {
      // Apply display-unit scaling first, then the currency formatter, then
      // the unit suffix (K/M/B) after the currency body.
      const { body, unitSuffix } = scaleForUnit(num, fmt?.displayUnit);
      const formatted = formatCurrencyCore(
        body,
        fmt?.currencyCode,
        fmt?.decimals,
        fmt?.thousands,
      );
      return wrap(`${formatted}${unitSuffix}`);
    }

    case 'percent': {
      // Percent multiplies by 100 and appends '%'. Display unit is ignored
      // for percent (a "million percent" is nonsensical).
      const pct = num * 100;
      const formatted = formatNumberCore(
        pct,
        fmt?.decimals ?? 0,
        fmt?.thousands,
      );
      return wrap(`${formatted}%`);
    }

    case 'scientific': {
      const digits =
        typeof fmt?.decimals === 'number' && fmt.decimals >= 0
          ? fmt.decimals
          : 2;
      return wrap(num.toExponential(digits));
    }

    case 'number':
    case 'auto':
    default: {
      const { body, unitSuffix } = scaleForUnit(num, fmt?.displayUnit);
      const formatted = formatNumberCore(body, fmt?.decimals, fmt?.thousands);
      return wrap(`${formatted}${unitSuffix}`);
    }
  }
}

/**
 * Scale a number for a display unit and report the suffix to append. `auto`
 * derives the scale from the magnitude; `none`/undefined is the identity.
 * Returns the scaled body and the unit suffix ('' when no scaling).
 */
function scaleForUnit(
  n: number,
  unit: DisplayUnit | undefined,
): { body: number; unitSuffix: string } {
  if (!unit || unit === 'none') return { body: n, unitSuffix: '' };
  const scale =
    unit === 'auto' ? resolveAutoUnit(Math.abs(n)) : UNIT_SCALES[unit];
  if (!scale || scale.factor === 1)
    return { body: n, unitSuffix: scale?.suffix ?? '' };
  return { body: n / scale.factor, unitSuffix: scale.suffix };
}

export default formatValue;
