/**
 * temporal — chronological ordering + relative-date resolution helpers for
 * the Analyses visual layer (Wave 2, TYPE-SEMANTICS).
 *
 * Two concerns:
 *
 *   1. chronoSortKey(raw) — an epoch-ms sort key derived from the UNDERLYING
 *      date value, so a date dimension orders chronologically (Jan, Feb, Mar…)
 *      instead of alphabetically by its formatted label (Apr, Aug, Dec…). The
 *      transformer sorts category rows by this key when the dimension is
 *      temporal, fixing the long-standing "months sort alphabetically" bug.
 *
 *   2. resolveRelativeDate(token, now) — resolve a relative-date token
 *      ('last-7-days', 'ytd', 'mtd', 'last-quarter', …) to a concrete
 *      { from, to } bound. This is a thin adapter over the existing,
 *      well-tested `resolveRelativePreset` in the filter-dialog util so there
 *      is ONE source of truth for the period math; this file only maps the
 *      hyphenated/short token vocabulary onto that resolver's preset ids.
 *
 * Pure, framework-free, unit-testable. No external date library.
 */

import {
  RelativeDatePreset,
  resolveRelativePreset,
} from '../components/filter-dialog/relative-date-presets.util';

/* ────────────────────────────────────────────────────────────────────────
 * 1. Chronological sort key
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Best-effort ISO detection so a plain "2024-04" or "2024-04-01" string
 * parses reliably across engines. `new Date('2024-04')` is spec-defined
 * (UTC), `new Date('2024')` is a year — both acceptable ordering keys.
 */
const ISO_LIKE = /^\d{4}(-\d{2}(-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?)?)?$/;

/**
 * A month-name-only label ("Apr", "August", "Apr 2024") — the exact case the
 * alphabetical bug bites. We map the leading month token to its index so
 * bare month labels still order Jan→Dec. Returns a synthetic key in a fixed
 * pseudo-year (month index as ms offset) when only a month is present.
 */
const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Chronological sort key (epoch milliseconds) for a raw date-ish value.
 *
 * Accepts Date, epoch number, ISO/parsable date string, and bare month
 * labels. Returns the value's time in ms. When the value cannot be parsed as
 * a date at all, returns Number.POSITIVE_INFINITY so un-dated / junk rows sort
 * to the END rather than jumping to the front (epoch 0).
 *
 *   chronoSortKey('2024-02-01') < chronoSortKey('2024-11-01')   // Feb before Nov
 *   chronoSortKey('Apr')        < chronoSortKey('Aug')          // month labels
 */
export function chronoSortKey(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') {
    return Number.POSITIVE_INFINITY;
  }

  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;
  }

  const s = String(raw).trim();

  // Direct parse for ISO-like strings (fast path, deterministic).
  if (ISO_LIKE.test(s)) {
    const t = new Date(s).getTime();
    if (!Number.isNaN(t)) return t;
  }

  // Bare month label ("Apr", "August", "Apr 2024", "Apr-2024"). Order by
  // (year, monthIndex) so a mixed-year set still sorts correctly and a
  // year-less set sorts Jan→Dec within a synthetic year.
  const monthMatch = s.match(/^([A-Za-z]+)[\s-]*?(\d{4})?$/);
  if (monthMatch) {
    const mi = MONTH_INDEX[monthMatch[1].toLowerCase()];
    if (mi !== undefined) {
      const year = monthMatch[2] ? Number(monthMatch[2]) : 2000;
      return new Date(year, mi, 1).getTime();
    }
  }

  // General fallback — let the engine try (covers "Dec 16, 2025",
  // locale-ish strings). NaN → sort to end.
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/**
 * True when a set of raw category values looks temporal — a strong majority
 * parse to a finite chronoSortKey. Used by the transformer to decide whether
 * to apply chronological ordering to a dimension's categories. Sampling-based
 * and cheap; a mostly-numeric-string column (which also "parses" via Date on
 * some inputs) is excluded by requiring at least one non-pure-number sample.
 */
export function looksTemporal(values: unknown[]): boolean {
  if (!Array.isArray(values) || values.length === 0) return false;
  let dated = 0;
  let considered = 0;
  let sawNonNumeric = false;
  const limit = Math.min(values.length, 20);
  for (let i = 0; i < values.length && considered < limit; i++) {
    const v = values[i];
    if (v === null || v === undefined || v === '') continue;
    considered++;
    // A pure number / numeric string is NOT evidence of a date (years like
    // 2024 aside — those still sort fine as numbers elsewhere).
    const isPureNumber =
      typeof v === 'number' ||
      (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()));
    if (!isPureNumber) sawNonNumeric = true;
    if (Number.isFinite(chronoSortKey(v))) dated++;
  }
  if (considered === 0) return false;
  return sawNonNumeric && dated / considered >= 0.8;
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. Relative-date resolution
 * ──────────────────────────────────────────────────────────────────────── */

/** Concrete resolved bounds. `to` is end-of-day inclusive. */
export interface RelativeDateRange {
  from: Date;
  to: Date;
}

/**
 * Map the hyphenated / short relative-date vocabulary this wave exposes onto
 * the filter-dialog resolver's canonical preset ids. Anything already a
 * canonical id (e.g. 'last_7_days') passes through untouched.
 */
const TOKEN_TO_PRESET: Record<string, RelativeDatePreset> = {
  'today': 'today',
  'yesterday': 'yesterday',
  'last-7-days': 'last_7_days',
  'last-30-days': 'last_30_days',
  'last-90-days': 'last_90_days',
  'wtd': 'week_to_date',
  'week-to-date': 'week_to_date',
  'mtd': 'month_to_date',
  'month-to-date': 'month_to_date',
  'qtd': 'quarter_to_date',
  'quarter-to-date': 'quarter_to_date',
  'ytd': 'year_to_date',
  'year-to-date': 'year_to_date',
  'last-week': 'previous_week',
  'previous-week': 'previous_week',
  'last-month': 'previous_month',
  'previous-month': 'previous_month',
  'last-quarter': 'previous_quarter',
  'previous-quarter': 'previous_quarter',
  'last-year': 'previous_year',
  'previous-year': 'previous_year',
};

/**
 * Resolve a relative-date token to concrete { from, to } bounds against
 * `now`. Accepts both this wave's hyphen/short tokens (last-7-days, ytd,
 * qtd, mtd, last-quarter, last-year, …) and the filter-dialog's canonical
 * preset ids (last_7_days, year_to_date, …). Returns null for an unknown
 * token or 'custom' (the caller keeps its absolute range).
 *
 * Delegates the actual period math to `resolveRelativePreset` so there is a
 * single source of truth; this only normalises the token vocabulary and
 * renames the resolved { start, end } to { from, to }.
 */
export function resolveRelativeDate(
  token: string | null | undefined,
  now: Date = new Date(),
): RelativeDateRange | null {
  if (!token) return null;
  const normalized = token.trim().toLowerCase().replace(/_/g, '-');
  const preset =
    TOKEN_TO_PRESET[normalized] ??
    // Allow a canonical underscore id straight through.
    (token.trim().toLowerCase() as RelativeDatePreset);

  const resolved = resolveRelativePreset(preset, now);
  if (!resolved) return null;
  return { from: resolved.start, to: resolved.end };
}

export default chronoSortKey;
