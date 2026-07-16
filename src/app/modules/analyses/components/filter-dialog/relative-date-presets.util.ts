/**
 * Relative-date preset library (Slice D, item 2).
 *
 * A curated set of relative date-range presets (Today, Last 7 days,
 * Month-to-date, Previous quarter, …) that authors pick in the
 * filter-dialog for a `time_range` filter. The chosen preset id is
 * stored on `config.relativePreset`; the filter bar resolves it to a
 * concrete [start, end] pair at APPLY time so a saved "Last 7 days"
 * always reflects the current clock, not the clock at authoring time.
 *
 * The 'custom' preset is the escape hatch — it keeps the existing
 * absolute date-range picker (config.dateRangeStart / dateRangeEnd).
 * Everything else resolves live.
 *
 * Kept framework-free (pure functions, no Angular deps) so both the
 * dialog and the bar can import it, and so it's trivially unit-testable.
 */

/** Stable preset ids — persisted verbatim in `config.relativePreset`. */
export type RelativeDatePreset =
  | 'custom'
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'week_to_date'
  | 'month_to_date'
  | 'quarter_to_date'
  | 'year_to_date'
  | 'previous_week'
  | 'previous_month'
  | 'previous_quarter'
  | 'previous_year';

/** i18n key for a preset's dropdown label. */
export interface RelativePresetOption {
  value: RelativeDatePreset;
  labelKey: string;
}

/**
 * Ordered option list for the preset dropdown. `custom` sits first so
 * it reads as "the manual option", then the running windows, then the
 * to-date windows, then the previous-period windows.
 */
export const RELATIVE_DATE_PRESETS: RelativePresetOption[] = [
  { value: 'custom', labelKey: 'ANALYSES.FILTER.PRESET_CUSTOM' },
  { value: 'today', labelKey: 'ANALYSES.FILTER.PRESET_TODAY' },
  { value: 'yesterday', labelKey: 'ANALYSES.FILTER.PRESET_YESTERDAY' },
  { value: 'last_7_days', labelKey: 'ANALYSES.FILTER.PRESET_LAST_7_DAYS' },
  { value: 'last_30_days', labelKey: 'ANALYSES.FILTER.PRESET_LAST_30_DAYS' },
  { value: 'last_90_days', labelKey: 'ANALYSES.FILTER.PRESET_LAST_90_DAYS' },
  { value: 'week_to_date', labelKey: 'ANALYSES.FILTER.PRESET_WEEK_TO_DATE' },
  { value: 'month_to_date', labelKey: 'ANALYSES.FILTER.PRESET_MONTH_TO_DATE' },
  {
    value: 'quarter_to_date',
    labelKey: 'ANALYSES.FILTER.PRESET_QUARTER_TO_DATE',
  },
  { value: 'year_to_date', labelKey: 'ANALYSES.FILTER.PRESET_YEAR_TO_DATE' },
  { value: 'previous_week', labelKey: 'ANALYSES.FILTER.PRESET_PREVIOUS_WEEK' },
  { value: 'previous_month', labelKey: 'ANALYSES.FILTER.PRESET_PREVIOUS_MONTH' },
  {
    value: 'previous_quarter',
    labelKey: 'ANALYSES.FILTER.PRESET_PREVIOUS_QUARTER',
  },
  { value: 'previous_year', labelKey: 'ANALYSES.FILTER.PRESET_PREVIOUS_YEAR' },
];

/** Set of valid preset ids (for cheap validation on load). */
const PRESET_IDS = new Set<string>(RELATIVE_DATE_PRESETS.map(p => p.value));

/** True when `id` is one of the known relative presets (excludes ''/undefined). */
export function isRelativePreset(id: unknown): id is RelativeDatePreset {
  return typeof id === 'string' && PRESET_IDS.has(id);
}

/** A concrete, resolved range. `end` is exclusive-friendly (end of day). */
export interface ResolvedDateRange {
  start: Date;
  end: Date;
}

/** Start-of-day (00:00:00.000) clone. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** End-of-day (23:59:59.999) clone. */
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Add `n` days (may be negative) to a date, preserving time-of-day. */
function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + n);
  return copy;
}

/**
 * Monday-based start of the ISO week containing `d`. Uses Monday as the
 * week start to match the calendar controls elsewhere in the app.
 */
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun … 6=Sat
  // Days since Monday: Sun(0) → 6, Mon(1) → 0, … Sat(6) → 5.
  const sinceMonday = (day + 6) % 7;
  return startOfDay(addDays(d, -sinceMonday));
}

/** First day of the month containing `d`. */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/** Last day of the month containing `d`, end-of-day. */
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** First day of the calendar quarter (Jan/Apr/Jul/Oct) containing `d`. */
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0);
}

/** Last day of the calendar quarter containing `d`, end-of-day. */
function endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
}

/**
 * Resolve a relative preset to a concrete [start, end] range against
 * `now` (defaults to the current clock). Returns null for 'custom' (the
 * caller keeps its absolute range) and for any unknown id.
 *
 * All ranges are inclusive of whole days: `start` is 00:00:00.000 of
 * the first day, `end` is 23:59:59.999 of the last day.
 */
export function resolveRelativePreset(
  preset: string | null | undefined,
  now: Date = new Date(),
): ResolvedDateRange | null {
  if (!isRelativePreset(preset) || preset === 'custom') return null;

  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };

    case 'yesterday': {
      const y = addDays(now, -1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }

    // Rolling windows include today as the last day: last 7 days =
    // today + the 6 days before it.
    case 'last_7_days':
      return { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
    case 'last_30_days':
      return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
    case 'last_90_days':
      return { start: startOfDay(addDays(now, -89)), end: endOfDay(now) };

    // To-date windows: from the period start through today.
    case 'week_to_date':
      return { start: startOfWeek(now), end: endOfDay(now) };
    case 'month_to_date':
      return { start: startOfMonth(now), end: endOfDay(now) };
    case 'quarter_to_date':
      return { start: startOfQuarter(now), end: endOfDay(now) };
    case 'year_to_date':
      return {
        start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        end: endOfDay(now),
      };

    // Previous complete periods.
    case 'previous_week': {
      const thisWeekStart = startOfWeek(now);
      const prevWeekStart = addDays(thisWeekStart, -7);
      const prevWeekEnd = endOfDay(addDays(thisWeekStart, -1));
      return { start: prevWeekStart, end: prevWeekEnd };
    }
    case 'previous_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case 'previous_quarter': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { start: startOfQuarter(prev), end: endOfQuarter(prev) };
    }
    case 'previous_year':
      return {
        start: new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0),
        end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
      };

    default:
      return null;
  }
}
