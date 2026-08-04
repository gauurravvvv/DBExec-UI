/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/promptValueSource.ts
 *   FE: src/app/shared/validators/promptValueSource.ts
 *
 * Prompt value-source configuration (spec 6.6.1): where a prompt's selectable
 * options come from. Five admin methods collapse to four persisted kinds:
 *   - static          curated PromptValue rows (typed by hand or bulk-pasted/CSV)
 *   - lookup_query    an admin-authored SELECT returning value + display
 *   - distinct_column schema.table.column the server turns into SELECT DISTINCT
 *   - free            no list at all
 *
 * The server re-probes cardinality on save and forces server-paged typeahead
 * above a threshold — these are runtime-safety rules, not UX preferences.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

export const VALUE_SOURCE_KINDS = [
  'free',
  'static',
  'lookup_query',
  'distinct_column',
] as const;

/** One curated option for the static kind. */
const staticOption = z.object({
  value: z.string().min(1).max(400),
  display: z.string().max(400).optional(),
});

/** A SQL identifier segment (schema / table / column) — no quoting, no dots. */
const identifier = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'validation.prompt.valueSource.identifier.invalid',
  });

const staticSource = z.object({
  kind: z.literal('static'),
  // The full curated list (replaces existing PromptValue rows on save).
  options: z.array(staticOption).max(50000),
});

const lookupQuerySource = z.object({
  kind: z.literal('lookup_query'),
  // A SELECT returning at least value (and optionally display). Validated as a
  // safe single SELECT server-side before it is stored.
  sql: z.string().min(1).max(20000),
});

const distinctColumnSource = z.object({
  kind: z.literal('distinct_column'),
  schema: identifier,
  table: identifier,
  column: identifier,
  // Optional display column; defaults to the value column.
  displayColumn: identifier.optional(),
});

const freeSource = z.object({
  kind: z.literal('free'),
});

export const promptValueSourceSchema = z.discriminatedUnion('kind', [
  freeSource,
  staticSource,
  lookupQuerySource,
  distinctColumnSource,
]);
export type PromptValueSource = z.infer<typeof promptValueSourceSchema>;

/** PUT /prompts/:id/value-source body. */
export const putPromptValueSourceSchema = z.object({
  valueSource: promptValueSourceSchema,
});

/** POST /prompts/:id/values/preview body — try a source before saving. */
export const previewPromptValuesSchema = z.object({
  valueSource: promptValueSourceSchema,
  limit: z.number().int().min(1).max(500).default(50),
});

/** POST /prompts/:id/values/search body — runtime typeahead + cascade. */
export const searchPromptValuesSchema = z.object({
  search: z.string().max(400).default(''),
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  // Cascading parent selections: { parentPromptId: [values] }.
  dependsOn: z.record(z.string(), z.array(z.string().max(400))).default({}),
});

/** POST /prompts/:id/values/resolve body — bulk paste at runtime. */
export const resolvePromptValuesSchema = z.object({
  raw: z.string().max(1000000),
});

/** Split a bulk-paste blob on newline, comma and tab; trim + de-dup + cap. */
export function splitPastedValues(raw: string, cap = 5000): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\n,\t]+/)) {
    const v = piece.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}
