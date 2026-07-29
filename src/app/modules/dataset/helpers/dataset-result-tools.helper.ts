/**
 * Pure, dependency-free serialisation and analysis of the result grid's
 * in-memory preview rows: CSV/JSON export, column profiling, and the
 * SQL/column diffs the save-review pane shows.
 *
 * Shared by add-dataset and edit-dataset. It previously sat inside
 * `components/add-dataset/`, which meant edit-dataset reached sideways into
 * another component's folder to use it; it now lives in `helpers/` where both
 * screens are peers of it.
 *
 * Everything here operates on rows the grid already holds — no BE round-trips,
 * no new npm deps. The surrounding decisions (file naming, export payloads,
 * upload validation) live in `dataset-export.helper.ts`.
 */

/** A row is a plain record keyed by column name (BE `data[]` shape). */
export type ResultRow = Record<string, unknown>;

// ── CSV / JSON export ────────────────────────────────────────────────

/**
 * Escape a single CSV field per RFC 4180: wrap in double quotes and
 * double any embedded quote when the value contains a comma, quote,
 * CR or LF. null/undefined serialize to an empty field.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'object') {
    // Objects / arrays (parsed JSONB etc.) — compact JSON so the cell
    // stays a single field rather than exploding across columns.
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  } else {
    s = String(value);
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize rows to a CSV string. `columns` fixes the column order and
 * set (respect visible/current columns). Header row always emitted.
 */
export function rowsToCsv(columns: string[], rows: ResultRow[]): string {
  const header = columns.map(csvEscape).join(',');
  const body = rows
    .map(row => columns.map(col => csvEscape(row?.[col])).join(','))
    .join('\r\n');
  return body ? `${header}\r\n${body}` : header;
}

/**
 * Serialize rows to a pretty-printed JSON array of objects, keyed by
 * the given columns (so the export mirrors what the grid shows even
 * when a row carries extra keys).
 */
export function rowsToJson(columns: string[], rows: ResultRow[]): string {
  const projected = rows.map(row => {
    const out: ResultRow = {};
    for (const col of columns) out[col] = row?.[col] ?? null;
    return out;
  });
  return JSON.stringify(projected, null, 2);
}

/**
 * Trigger a client-side download of `content` as a file. Uses a Blob +
 * object URL + synthetic <a> click, then revokes the URL. Guarded for
 * SSR / non-browser contexts.
 */
export function downloadTextFile(
  content: string,
  fileName: string,
  mimeType: string,
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Column profiling ─────────────────────────────────────────────────

export interface ColumnProfile {
  column: string;
  /** Rows scanned (the loaded preview set). */
  total: number;
  /** Count of null / undefined / empty-string cells. */
  nulls: number;
  /** nulls / total as a 0–100 percentage (0 when total is 0). */
  nullPct: number;
  /** Distinct non-null values seen (capped scan for safety). */
  distinct: number;
  /** True when every non-null cell parsed as a finite number. */
  isNumeric: boolean;
  /** Numeric aggregates — only populated when isNumeric. */
  min: number | null;
  max: number | null;
  avg: number | null;
}

function isNullish(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Profile one column over the preview rows: null %, distinct count and
 * (for all-numeric columns) min/max/avg. Distinct is computed from a
 * stringified key so objects/dates collapse sensibly.
 */
export function profileColumn(
  column: string,
  rows: ResultRow[],
): ColumnProfile {
  const total = rows.length;
  let nulls = 0;
  const seen = new Set<string>();
  let numericCount = 0;
  let nonNull = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const v = row?.[column];
    if (isNullish(v)) {
      nulls++;
      continue;
    }
    nonNull++;
    // Distinct key — stable string form.
    const key = typeof v === 'object' ? JSON.stringify(v) : String(v);
    seen.add(key);
    // Numeric detection: number, or a numeric-looking string/bigint.
    const n =
      typeof v === 'number'
        ? v
        : typeof v === 'bigint'
          ? Number(v)
          : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))
            ? Number(v)
            : NaN;
    if (Number.isFinite(n)) {
      numericCount++;
      sum += n;
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }

  const isNumeric = nonNull > 0 && numericCount === nonNull;
  return {
    column,
    total,
    nulls,
    nullPct: total > 0 ? Math.round((nulls / total) * 100) : 0,
    distinct: seen.size,
    isNumeric,
    min: isNumeric ? min : null,
    max: isNumeric ? max : null,
    avg: isNumeric && numericCount > 0 ? sum / numericCount : null,
  };
}

/** Profile every column. */
export function profileColumns(
  columns: string[],
  rows: ResultRow[],
): ColumnProfile[] {
  return columns.map(col => profileColumn(col, rows));
}

/** Bucket a null-% into a traffic-light severity for the bar colour. */
export function nullPctSeverity(pct: number): 'good' | 'warn' | 'bad' {
  if (pct >= 50) return 'bad';
  if (pct >= 10) return 'warn';
  return 'good';
}

// ── SQL + column diff (Slice 3) ──────────────────────────────────────

export interface SqlDiffLine {
  kind: 'same' | 'added' | 'removed';
  oldLine: string | null;
  newLine: string | null;
}

/**
 * A minimal line-level diff (LCS) between two SQL strings, good enough
 * for a side-by-side / inline review pane. No external dep.
 */
export function diffSqlLines(oldSql: string, newSql: string): SqlDiffLine[] {
  const a = (oldSql ?? '').replace(/\r\n/g, '\n').split('\n');
  const b = (newSql ?? '').replace(/\r\n/g, '\n').split('\n');
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: SqlDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', oldLine: a[i], newLine: b[j] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'removed', oldLine: a[i], newLine: null });
      i++;
    } else {
      out.push({ kind: 'added', oldLine: null, newLine: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'removed', oldLine: a[i++], newLine: null });
  while (j < m) out.push({ kind: 'added', oldLine: null, newLine: b[j++] });
  return out;
}

/** A preview-columns / dataset-field column reduced to name + type. */
export interface SimpleColumn {
  name: string;
  dataType: string;
}

export interface ColumnDelta {
  added: SimpleColumn[];
  removed: SimpleColumn[];
  /** Heuristic rename pairs (one removed + one added, same type). */
  renamed: { from: string; to: string; dataType: string }[];
  /** Same name, different type. */
  typeChanged: { name: string; from: string; to: string }[];
  /** True when nothing changed. */
  unchanged: boolean;
}

function normType(t: string | undefined | null): string {
  return (t ?? '').toString().trim().toLowerCase();
}

/**
 * Diff the CURRENT dataset columns (from saved fields) against the
 * columns the new SQL would produce (from preview-columns).
 *
 * Rename heuristic: after computing raw added/removed sets, pair a
 * removed column with an added column when they share the same
 * (normalized) data type and there's exactly one candidate on each
 * side for that type — conservative enough to avoid false renames.
 */
export function diffColumns(
  current: SimpleColumn[],
  next: SimpleColumn[],
): ColumnDelta {
  const curByName = new Map(current.map(c => [c.name, c]));
  const nextByName = new Map(next.map(c => [c.name, c]));

  const rawAdded: SimpleColumn[] = next.filter(c => !curByName.has(c.name));
  const rawRemoved: SimpleColumn[] = current.filter(
    c => !nextByName.has(c.name),
  );

  const typeChanged: ColumnDelta['typeChanged'] = [];
  for (const c of current) {
    const n = nextByName.get(c.name);
    if (n && normType(n.dataType) !== normType(c.dataType)) {
      typeChanged.push({
        name: c.name,
        from: c.dataType,
        to: n.dataType,
      });
    }
  }

  // Rename detection over the raw added/removed sets.
  const renamed: ColumnDelta['renamed'] = [];
  const addedLeft = [...rawAdded];
  const removedLeft = [...rawRemoved];
  const typesOf = (list: SimpleColumn[]) => {
    const m = new Map<string, SimpleColumn[]>();
    for (const c of list) {
      const t = normType(c.dataType);
      (m.get(t) ?? m.set(t, []).get(t)!).push(c);
    }
    return m;
  };
  const addedByType = typesOf(addedLeft);
  const removedByType = typesOf(removedLeft);
  for (const [t, rem] of removedByType) {
    const add = addedByType.get(t);
    if (rem.length === 1 && add && add.length === 1) {
      renamed.push({ from: rem[0].name, to: add[0].name, dataType: t });
    }
  }
  const renamedFrom = new Set(renamed.map(r => r.from));
  const renamedTo = new Set(renamed.map(r => r.to));

  const added = rawAdded.filter(c => !renamedTo.has(c.name));
  const removed = rawRemoved.filter(c => !renamedFrom.has(c.name));

  const unchanged =
    added.length === 0 &&
    removed.length === 0 &&
    renamed.length === 0 &&
    typeChanged.length === 0;

  return { added, removed, renamed, typeChanged, unchanged };
}
