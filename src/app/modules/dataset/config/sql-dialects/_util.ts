/**
 * Tiny helpers shared by every per-engine dialect file. Kept private to
 * the sql-dialects folder via the leading underscore convention.
 */

/**
 * lang-sql's SQLDialectSpec stores keyword/type lists as a single
 * whitespace-separated string. Split, deduplicate, uppercase. Returns
 * an empty array when the input is undefined so callers don't have to
 * null-check the optional spec fields.
 */
export function splitDialectWords(input: string | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/\s+/)) {
    const w = raw.trim();
    if (!w) continue;
    const upper = w.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push(upper);
  }
  return out;
}

/**
 * Merge two keyword arrays, deduplicating case-insensitively. Used by
 * dialects that extend a base (e.g. MariaDB extends MySQL with extra
 * keywords; MSSQL adds its own on top of standard SQL).
 */
export function mergeKeywords(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const w of list) {
      const upper = w.toUpperCase();
      if (seen.has(upper)) continue;
      seen.add(upper);
      out.push(upper);
    }
  }
  return out;
}
