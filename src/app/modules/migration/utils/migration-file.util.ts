/**
 * migration-file.util — framework-free helpers for the seamless asset
 * migration file exchange:
 *   - `downloadBlob`   trigger a browser download of a Blob under a filename.
 *   - `parseBundleFile` read a picked file → JSON.parse → validate against the
 *                       mirrored Zod bundle schema → typed bundle.
 *
 * These are plain functions (not an Angular service) so they can be reused
 * anywhere without pulling in DI. The download helper mirrors the one in
 * `dashboard-export.util.ts` (that copy is private to its module, so we keep a
 * small local copy here rather than reach across module boundaries).
 */
import {
  DbExecMigrationBundle,
  migrationBundleSchema,
} from 'src/app/shared/validators/migration';

/** Hard cap on an uploaded migration file — DoS / mis-pick guard. */
export const MIGRATION_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Accepted extensions for a migration file. */
const MIGRATION_FILE_EXTENSIONS = ['.dbexec.json', '.dbexec', '.json'];

/**
 * A parse/validation failure carrying an i18n message KEY (not a resolved
 * string) so the caller can run it through the translate layer. Zod issue
 * messages in the mirrored validator are themselves i18n keys
 * (`validation.migration.*`); a bad-JSON / size / extension failure carries a
 * `MIGRATION.*` key.
 */
export class MigrationFileError extends Error {
  constructor(
    /** i18n key to resolve for display. */
    public readonly messageKey: string,
  ) {
    super(messageKey);
    this.name = 'MigrationFileError';
  }
}

/** Trigger a browser download of a Blob under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the click's navigation has committed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** True when the filename ends with one of the accepted migration extensions. */
function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return MIGRATION_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/** Read a File as UTF-8 text via FileReader (Promise wrapper). */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}

/**
 * Read + validate a picked migration file into a typed bundle.
 *
 * Order of checks: extension → size → JSON.parse → Zod safeParse. Any failure
 * throws a `MigrationFileError` carrying an i18n key:
 *   - extension / size  → `MIGRATION.INVALID_FILE` / `MIGRATION.FILE_TOO_LARGE`
 *   - bad JSON          → `MIGRATION.INVALID_FILE`
 *   - schema mismatch   → the first Zod issue's message (a
 *                         `validation.migration.*` i18n key)
 */
export async function parseBundleFile(
  file: File,
): Promise<DbExecMigrationBundle> {
  if (!hasAllowedExtension(file.name)) {
    throw new MigrationFileError('MIGRATION.INVALID_FILE');
  }
  if (file.size > MIGRATION_MAX_FILE_BYTES) {
    throw new MigrationFileError('MIGRATION.FILE_TOO_LARGE');
  }

  const text = await readText(file);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new MigrationFileError('MIGRATION.INVALID_FILE');
  }

  const parsed = migrationBundleSchema.safeParse(raw);
  if (!parsed.success) {
    // The Zod message IS an i18n key; surface the first issue.
    const key =
      parsed.error.issues[0]?.message ?? 'MIGRATION.INVALID_FILE';
    throw new MigrationFileError(key);
  }

  return parsed.data;
}
