/**
 * Pure, dependency-free export helpers for the analyses authoring canvas
 * (Slice F). A visual's current underlying rows → CSV, plus a small
 * client-side file-download trigger and a filename sanitiser.
 *
 * The CSV functions are lifted verbatim (RFC-4180 escaping) from the
 * dataset editor's dataset-result-tools.helper so both surfaces produce
 * identical output; copied here rather than cross-imported so the analyses
 * module has no reach into dataset-internal files. No new npm deps.
 */

/** A row is a plain record keyed by column name (BE `data[]` shape). */
export type ExportRow = Record<string, unknown>;

/**
 * Escape a single CSV field per RFC 4180: wrap in double quotes and
 * double any embedded quote when the value contains a comma, quote, CR
 * or LF. null/undefined serialize to an empty field; objects/arrays are
 * compacted to JSON so a cell stays one field.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'object') {
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
 * set; the header row is always emitted (even for an empty body).
 */
export function rowsToCsv(columns: string[], rows: ExportRow[]): string {
  const header = columns.map(csvEscape).join(',');
  const body = rows
    .map(row => columns.map(col => csvEscape(row?.[col])).join(','))
    .join('\r\n');
  return body ? `${header}\r\n${body}` : header;
}

/**
 * Derive a stable, ordered column list from a set of rows. Uses the union
 * of keys across every row so a ragged result (rows missing some keys)
 * still exports every column; first-seen order is preserved.
 */
export function columnsFromRows(rows: ExportRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/**
 * Trigger a client-side download of `content` as a file. Uses a Blob +
 * object URL + synthetic <a> click, then revokes the URL. Guarded for
 * SSR / non-browser contexts.
 *
 * UTF-8 BOM (Excel unicode correctness): the product exports data from
 * customer databases in ANY locale — column values may be Japanese, German
 * (umlauts), Cyrillic, emoji, etc. Excel on Windows only decodes a CSV as
 * UTF-8 when the file STARTS with the byte-order mark (U+FEFF); without it,
 * non-ASCII text opens as mojibake. So for CSV downloads we prepend the BOM
 * to the Blob bytes. It is added at the download boundary (not inside the CSV
 * string) so `rowsToCsv`'s output stays byte-clean for any non-download
 * consumer, and only for CSV mime types so other text downloads are
 * untouched.
 */
export function downloadTextFile(
  content: string,
  fileName: string,
  mimeType: string,
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const isCsv = /(^|[/;+])csv\b/i.test(mimeType);
  // UTF-8 byte-order mark, built from its code point (0xFEFF) so no editor
  // or lint pass can strip an invisible literal from source.
  const BOM = String.fromCharCode(0xfeff);
  const parts: BlobPart[] = isCsv ? [BOM, content] : [content];
  const blob = new Blob(parts, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Trigger a client-side download of a data-URL (e.g. a PNG produced by
 * ECharts getDataURL). Same synthetic-anchor approach as downloadTextFile
 * but no Blob/URL round trip is needed since the href is already a URL.
 */
export function downloadDataUrl(dataUrl: string, fileName: string): void {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

/**
 * Reduce an arbitrary visual title to a safe file-name stem: strip
 * characters illegal on common filesystems, collapse whitespace to
 * dashes, and fall back to a default when nothing usable remains.
 */
export function safeFileStem(title: string | null | undefined): string {
  const cleaned = (title ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'visual';
}
