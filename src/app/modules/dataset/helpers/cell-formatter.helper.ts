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
   *  text; no further coercion. For JSON cells this is the full
   *  pretty-printed form. */
  display: string;
  /** Logical type for class hooks + alignment. */
  kind: CellKind;
  /** Used by the SCSS .numeric-cell class. Right-aligned only for
   *  number-shaped cells; everything else is left-aligned. */
  align: 'left' | 'right';
  /** Compact one-line summary used by the popup for the collapsed
   *  state of JSON cells. Empty string for non-JSON cells. */
  summary?: string;
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
 * Single-line summary for JSON-shaped cells. The full
 * pretty-printed form lives in `display`; this collapsed form is
 * what the grid shows by default so one fat document doesn't make
 * every row in the grid 6em tall. Click-to-expand in the popup
 * flips to the full `display`.
 *
 * Strategy: arrays render as `[N items]`; objects render as
 * `{ key1, key2, key3, … }` showing up to 3 top-level keys; empty
 * containers get explicit `[]` / `{}`. Keeps the user's eye on
 * the *shape* of the value rather than truncating mid-string.
 */
function summariseJsonValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : `[${value.length} items]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return '{}';
    const shown = keys.slice(0, 3).join(', ');
    return keys.length > 3
      ? `{ ${shown}, … +${keys.length - 3} }`
      : `{ ${shown} }`;
  }
  return String(value);
}

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
  // pathologically big document doesn't blow up the grid. The
  // `summary` field carries the shape-oriented one-liner the popup
  // shows by default; the full `display` only renders when the
  // user clicks to expand.
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
    return {
      display,
      kind: 'json',
      align: 'left',
      summary: summariseJsonValue(value),
    };
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

// ── Column-width measurement ────────────────────────────────────────
//
// Auto-fit columns to content on result arrival. The popup grid
// renders with a <colgroup> whose width values come from this
// helper; PrimeNG honours the colgroup when [resizableColumns] is on
// and lets the user drag-resize from there.
//
// Pure function: takes columns + a sample of rows + the typography
// hints the popup uses, returns a width-per-column map in pixels.
// Reads no DOM beyond a hidden offscreen canvas for text measurement
// (no layout thrash, no element mounting needed).

/** Default measurement context — matches the popup's monospace cell
 *  font at fs-control. Override when the SCSS changes. */
export interface ColumnSizingOptions {
  /** CSS font shorthand the canvas uses. Should mirror the cell's
   *  computed font for the measurement to match what users see. */
  font: string;
  /** Maximum rows sampled per column. The popup paginates server-
   *  side so we only see the current page; sampling all of them is
   *  cheap. Kept as a knob in case a future caller wants a tighter
   *  bound on a very wide grid. */
  sampleSize: number;
  /** Lower bound — single-digit numeric columns shouldn't end up
   *  20px wide where neither header nor value can be read. */
  minWidth: number;
  /** Upper bound — pathologically long string values shouldn't push
   *  one column past the popup viewport. Above this we clip with
   *  text-overflow: ellipsis (CSS already does this; the cap just
   *  controls layout). */
  maxWidth: number;
  /** Extra horizontal padding the <td> adds around the text. The
   *  measurement excludes padding, so callers add it on top of the
   *  measured glyph width to get the actual cell width. */
  horizontalPaddingPx: number;
}

export const DEFAULT_COLUMN_SIZING_OPTIONS: ColumnSizingOptions = {
  // Mirrors the cell's computed font: fs-control (~13px), the
  // project's mono stack. The exact glyph metrics don't have to be
  // perfect — we round up at the end — but a near-match makes the
  // initial widths feel tight rather than loose.
  font: '13px ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  sampleSize: 50,
  minWidth: 80,
  // 420px cap balances "let timestamps + UUIDs render in full"
  // against "no single column dominates the popup width". Old
  // value was 320 which clipped 38-char UUIDs at the mono font
  // even when the popup had plenty of horizontal room.
  maxWidth: 420,
  horizontalPaddingPx: 28,
};

/** Lazily-created canvas reused across calls. measureText on a
 *  freshly-created canvas is ~3× slower than on a reused one. */
let measureCanvas: HTMLCanvasElement | null = null;
function getMeasureCtx(font: string): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null; // SSR/test guard
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = font;
  return ctx;
}

/**
 * Compute a per-column pixel width from the result data so the
 * grid columns auto-fit their content instead of all sharing equal
 * width. Header label width is included so a column with a long
 * name + short values doesn't end up too narrow to read its own
 * label.
 *
 * Returns {} on environments without a canvas (SSR / unit tests
 * without jsdom-canvas) so callers can safely fall back to the
 * default equal-share layout.
 */
export function measureColumnWidths(
  columns: string[],
  rows: any[],
  columnTypes?: Record<string, string>,
  optsOverride?: Partial<ColumnSizingOptions>,
): Record<string, number> {
  const opts: ColumnSizingOptions = {
    ...DEFAULT_COLUMN_SIZING_OPTIONS,
    ...optsOverride,
  };
  const ctx = getMeasureCtx(opts.font);
  if (!ctx) return {};

  const sample = rows.slice(0, opts.sampleSize);
  const widths: Record<string, number> = {};

  for (const col of columns) {
    // The column header carries the column name + the small type
    // chip below it; we measure just the name since the chip uses
    // fs-micro and is almost always narrower than the column name
    // at fs-control. Caller can tweak via the headerExtraPadding
    // option if a future redesign flips the proportion.
    const headerWidth = ctx.measureText(String(col)).width;

    let valueWidth = 0;
    for (const row of sample) {
      const raw = row?.[col];
      if (raw === null || raw === undefined) continue;
      // We measure the displayed string, not the raw value, so
      // BIGINTs preserved as strings, ISO-formatted dates, and
      // truncated JSON summaries all line up with what users see.
      // For non-trivial types (object, Date, Buffer) we route
      // through formatCellValue so the measured glyph width
      // matches the rendered display. For plain strings/numbers
      // the toString round-trip is fine and cheaper.
      let display: string;
      if (
        raw && typeof raw === 'object' &&
        !(raw instanceof Date) // Dates short-circuit via toISOString below
      ) {
        // For objects / buffers, run through formatCellValue and use
        // its `summary` if present (JSON cells render the summary by
        // default, so widths should be based on the summary).
        const cell = formatCellValue(raw, columnTypes?.[col]);
        display = cell.summary || cell.display;
      } else if (raw instanceof Date) {
        display = raw.toISOString();
      } else {
        display = String(raw);
      }
      const w = ctx.measureText(display).width;
      if (w > valueWidth) valueWidth = w;
    }

    const measured = Math.max(headerWidth, valueWidth);
    const withPadding = Math.ceil(measured + opts.horizontalPaddingPx);
    widths[col] = Math.min(opts.maxWidth, Math.max(opts.minWidth, withPadding));
  }

  return widths;
}

/**
 * After measureColumnWidths returns, optionally expand the LAST
 * column to absorb any leftover container width. Matches Excel /
 * Google Sheets / Numbers behaviour: the last (typically
 * most-descriptive) column uses whatever room is left after the
 * narrower columns have what they need.
 *
 * No-op if the columns already sum wider than the container
 * (horizontal scroll territory) or if there are no columns.
 *
 * `reservedPx` accounts for fixed-width chrome on the table —
 * the # row-number column (60px in the popup) and a small
 * scrollbar buffer.
 */
export function flexLastColumn(
  widths: Record<string, number>,
  columns: string[],
  containerWidth: number,
  reservedPx = 60 + 16,
): Record<string, number> {
  if (columns.length === 0) return widths;
  const sum = columns.reduce((acc, c) => acc + (widths[c] || 0), 0);
  const available = containerWidth - reservedPx;
  if (sum >= available) return widths;
  const lastCol = columns[columns.length - 1];
  const deficit = available - sum;
  return {
    ...widths,
    [lastCol]: (widths[lastCol] || 0) + deficit,
  };
}
