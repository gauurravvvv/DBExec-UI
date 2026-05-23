/**
 * cell-formatter — pure value formatter for the query-result popup
 * in add-dataset. Centralises the per-type rendering so the
 * template can stay simple (`{{ row[col] | cellFormat:type }}`)
 * and so we have one place to fix edge cases as we encounter new
 * engines.
 *
 * Drivers we care about and their quirks:
 *   - Postgres BIGINT comes as a string (pg driver default) to
 *     preserve precision. We keep it a string and right-align.
 *   - Snowflake NUMBER(38, 0) comes as a string for the same
 *     reason. Same treatment.
 *   - MySQL BIT(N) comes as a Buffer-shaped JSON object
 *     ({ type: 'Buffer', data: [byte] }). Length-1 BITs render
 *     as 'true' / 'false'; multi-byte BITs as hex.
 *   - Postgres + Oracle TIMESTAMP WITH TIME ZONE come as JS Date.
 *     We format with toISOString to dodge locale-dependent output.
 *   - Postgres JSONB / JSON come as plain JS objects (pg parses
 *     them). We pretty-print with a 5kB cap so the cell can show
 *     the shape without dominating the grid.
 *   - Oracle dates often arrive as `DD-MON-YY` strings depending
 *     on session NLS. `new Date(...)` returns NaN — we fall back
 *     to the raw string in that case.
 *
 * The function is pure: no DOM access, no timezone offset from
 * the user's machine beyond the JS Date's own ISO output (which
 * is UTC, deterministic).
 */

/** Soft cap on JSON pretty-print output. Above this we truncate
 *  and append the i18n marker so the cell stays usable. */
export const CELL_JSON_DISPLAY_CAP = 5_000;

export type CellKind =
  | 'null'
  | 'number'
  | 'json'
  | 'date'
  | 'bool'
  | 'buffer'
  | 'text';

export interface FormattedCell {
  /** Pre-stringified display value. The template renders this as
   *  text; no further coercion. */
  display: string;
  /** Logical type for class hooks + alignment. */
  kind: CellKind;
  /** Used by the SCSS .numeric-cell class. Right-aligned only for
   *  number-shaped cells; everything else is left-aligned. */
  align: 'left' | 'right';
}

const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const NUMERIC_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** Type-string hints from the BE columnTypes map that mean
 *  "treat the value as a number even when it arrives as string"
 *  (BIGINT / NUMBER / DECIMAL with precision). pg_typeof yields
 *  the postgres names; future driver-metadata wiring would add
 *  the others. Comparison is case-insensitive + substring. */
const NUMERIC_TYPE_HINTS = [
  'bigint',
  'numeric',
  'decimal',
  'number',
  'integer',
  'int8',
  'real',
  'double',
  'float',
  'money',
];

function looksLikeNumericType(type?: string): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return NUMERIC_TYPE_HINTS.some(h => t.includes(h));
}

function looksLikeBuffer(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as any).type === 'Buffer' &&
    Array.isArray((value as any).data)
  );
}

/**
 * Convert a Buffer-shaped JSON object into a friendly display.
 * MySQL BIT(1) usually means a boolean — one byte, value 0 or 1
 * — so we render those as `true / false`. Anything wider gets a
 * hex dump so the user can still recognise the value without
 * showing `[object Object]`.
 */
function formatBufferValue(bufLike: any): string {
  const bytes: number[] = bufLike.data || [];
  if (bytes.length === 1) {
    return bytes[0] === 0 ? 'false' : 'true';
  }
  return (
    '0x' +
    bytes
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** Lazy-load via injection at the call site. Helper only emits
 *  the truncation marker placeholder — the template substitutes
 *  the translated string. Keeps this file framework-free. */
const TRUNCATED_MARKER = '\n…(truncated)';

/**
 * Main entry point. `type` is the BE-supplied column type hint
 * (e.g. 'bigint', 'integer', 'jsonb'). Optional — when absent we
 * infer from the value's JS type alone.
 */
export function formatCellValue(value: unknown, type?: string): FormattedCell {
  // Null / undefined → handled by the template via the kind flag.
  if (value === null || value === undefined) {
    return { display: '', kind: 'null', align: 'left' };
  }

  // Buffer-shaped (MySQL BIT, MSSQL VARBINARY, postgres BYTEA via
  // some drivers). Detect by shape so we don't false-positive on
  // user JSON that happens to have a `data` array.
  if (looksLikeBuffer(value)) {
    return {
      display: formatBufferValue(value),
      kind: 'buffer',
      align: 'left',
    };
  }

  // JS Date instances. ISO output is UTC and deterministic; if the
  // user wants local-time formatting we'd add a setting (out of
  // scope for now).
  if (value instanceof Date) {
    return {
      display: value.toISOString(),
      kind: 'date',
      align: 'left',
    };
  }

  if (typeof value === 'boolean') {
    return { display: value ? 'true' : 'false', kind: 'bool', align: 'left' };
  }

  if (typeof value === 'number') {
    return {
      display: Number.isFinite(value) ? String(value) : String(value),
      kind: 'number',
      align: 'right',
    };
  }

  // Plain object (typically pg's parsed JSONB / Snowflake VARIANT
  // returned as JS object). Pretty-print with a soft cap so a
  // pathologically big document doesn't blow up the grid.
  if (typeof value === 'object') {
    let display: string;
    try {
      display = JSON.stringify(value, null, 2);
    } catch (_) {
      display = String(value);
    }
    if (display.length > CELL_JSON_DISPLAY_CAP) {
      display = display.slice(0, CELL_JSON_DISPLAY_CAP) + TRUNCATED_MARKER;
    }
    return { display, kind: 'json', align: 'left' };
  }

  // String: drivers return BIGINT / NUMBER / DECIMAL as string to
  // preserve precision. Keep as string (NEVER cast via Number() —
  // that's the precision-loss footgun this whole branch exists to
  // avoid) but right-align if either the value is numeric-shaped
  // OR the column's BE-reported type is numeric.
  if (typeof value === 'string') {
    if (NUMERIC_RE.test(value) || looksLikeNumericType(type)) {
      return { display: value, kind: 'number', align: 'right' };
    }

    // Date-shaped strings. JS Date can parse most of these; if it
    // can't (Oracle's `DD-MON-YY`), we fall back to the raw value
    // so the user sees something useful instead of "Invalid Date".
    if (ISO_LIKE_RE.test(value)) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        return {
          display: parsed.toISOString(),
          kind: 'date',
          align: 'left',
        };
      }
    }

    return { display: value, kind: 'text', align: 'left' };
  }

  // Bigint primitive. Same reasoning as the string-numeric path:
  // .toString() is the only safe coercion.
  if (typeof value === 'bigint') {
    return {
      display: value.toString(),
      kind: 'number',
      align: 'right',
    };
  }

  return { display: String(value), kind: 'text', align: 'left' };
}
