/**
 * Export and SQL-file-import logic for the dataset workbench screens.
 *
 * `dataset-result-tools.helper.ts` next door owns the *serialisation* (rows → CSV,
 * rows → JSON, the download primitive). This file owns the surrounding decisions
 * that both add-dataset and edit-dataset were carrying inline: what to name a file,
 * what payload the server-side export endpoint wants, and whether an uploaded file
 * is acceptable.
 *
 * Everything here is pure or DOM-only. Nothing knows about Angular, so nothing
 * needs a component to be testable — which is the point, since the two screens had
 * drifted copies of all of it.
 */

/** A row is a plain record keyed by column name (BE `data[]` shape). */
type ResultRow = Record<string, unknown>;

// ── File naming ──────────────────────────────────────────────────────

/**
 * Base file name for an export, from the first non-empty candidate.
 *
 * The two screens look at different sources — add-dataset has only the selected
 * datasource, edit-dataset prefers the dataset's own name and falls back through
 * two datasource fields. Rather than pick a winner (which would change one
 * screen's file names), each caller passes its own ordered candidates and gets
 * the behaviour it has today.
 *
 * Non-filename-safe runs collapse to a single underscore, matching what both
 * screens already did.
 */
export function exportBaseName(
  candidates: Array<string | null | undefined>,
): string {
  const picked = candidates.find(c => !!c && `${c}`.trim() !== '');
  return (picked || 'dataset').replace(/[^\w.-]+/g, '_');
}

// ── Server-side result export ────────────────────────────────────────

export interface ResultExportPayload {
  datasourceId: string;
  query: string;
  /** Only present when at least one column filter is active. */
  filter?: string;
}

/**
 * Build the payload for the server-side CSV export.
 *
 * The active column filters are forwarded so the exported file matches what the
 * grid is showing. Empty filter values are dropped, and `filter` is omitted
 * entirely when nothing is active — the BE treats a missing key and an empty
 * object differently, so this is not merely cosmetic.
 */
export function buildResultExportPayload(
  datasourceId: string,
  query: string,
  filterValues: Record<string, string>,
): ResultExportPayload {
  const filter: Record<string, string> = {};
  for (const col of Object.keys(filterValues ?? {})) {
    if (filterValues[col]) {
      filter[col] = filterValues[col];
    }
  }

  const payload: ResultExportPayload = { datasourceId, query };
  if (Object.keys(filter).length > 0) {
    payload.filter = JSON.stringify(filter);
  }
  return payload;
}

/**
 * Trigger a client-side download of a Blob the server produced.
 *
 * Distinct from `downloadTextFile`, which serialises in-memory rows. This one
 * hands over bytes the BE streamed, so it must not re-encode them.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// ── SQL script import ────────────────────────────────────────────────

export type SqlFileRejection = 'extension' | 'size';

export type SqlFileReadResult =
  | { ok: true; sql: string }
  | { ok: false; reason: SqlFileRejection | 'read' };

/** Extensions the SQL importer accepts. Both screens allowed exactly these two. */
const ACCEPTED_EXTENSIONS = ['.sql', '.txt'];

/**
 * Validate an uploaded file's extension and size without reading it.
 *
 * Split out from the read so a caller can show its own message per rejection
 * reason before any I/O happens, which is what both screens do.
 *
 * `maxSizeMb` is a parameter rather than a constant because the two screens
 * disagree: add-dataset caps at 2 MB, edit-dataset at 22 MB. Passing it in
 * preserves both. (The comment above edit-dataset's constant reads
 * "max 2MB", so 22 is very likely a typo — but changing it is a behaviour
 * change and belongs to the drift reconciliation, not here.)
 */
export function validateSqlFile(
  file: File,
  maxSizeMb: number,
): SqlFileRejection | null {
  const name = (file.name ?? '').toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some(ext => name.endsWith(ext))) {
    return 'extension';
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return 'size';
  }
  return null;
}

/**
 * Validate, then read a SQL file's text.
 *
 * Resolves rather than rejects on every failure path, so a caller handles one
 * shape instead of a mix of returns and exceptions.
 */
export function readSqlFile(
  file: File,
  maxSizeMb: number,
): Promise<SqlFileReadResult> {
  const rejection = validateSqlFile(file, maxSizeMb);
  if (rejection) return Promise.resolve({ ok: false, reason: rejection });

  return new Promise<SqlFileReadResult>(resolve => {
    const reader = new FileReader();
    reader.onload = (e: any) => resolve({ ok: true, sql: e?.target?.result ?? '' });
    reader.onerror = () => resolve({ ok: false, reason: 'read' });
    reader.readAsText(file);
  });
}
