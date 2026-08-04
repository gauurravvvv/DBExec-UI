/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/reference-data.ts
 *   FE: src/app/shared/validators/reference-data.ts
 *
 * Single source of truth for the reference_data family set — the list of
 * DB-driven enum vocabularies the /reference-data API groups rows by.
 * The BE validates the `:family` path param against this list; the FE
 * uses it to type the grouped read-API response.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

/** Every reference_data `family` discriminator. Kept in lock-step with
 *  the ROWS families seeded by seedReferenceData.ts. */
export const REFERENCE_DATA_FAMILIES = [
  'filter_operator',
  'alert_operator',
  'rls_operator',
  'aggregate_fn',
  'alert_severity',
  'alert_source_type',
  'alert_event_status',
  'value_type',
  'cron_preset',
  'filter_type',
  'filter_control',
  'filter_null_option',
  'relative_date_preset',
] as const;
export type ReferenceDataFamily = (typeof REFERENCE_DATA_FAMILIES)[number];

/** Zod enum for the family path param. */
export const referenceDataFamilySchema = z.enum(REFERENCE_DATA_FAMILIES, {
  message: 'validation.referenceData.family.invalid',
});

/** Shape of a single reference_data row as returned by the read API. */
export interface ReferenceDataRow {
  id: string;
  family: ReferenceDataFamily;
  code: string;
  label: string;
  description: string | null;
  meta: Record<string, unknown> | null;
  sequence: number;
}

/**
 * meta contract for the `filter_operator` family, consumed by the query-builder
 * SQL compiler. Validated at seed time so a typo in a sqlTemplate surfaces at
 * boot rather than as a runtime CompileError for one org.
 *
 * arity drives the runtime control and the number of value slots the compiler
 * binds. sqlTemplate uses only {expr} and {p1}/{p2} slots. valueTransform wraps
 * a LIKE value (prefix / suffix / contains). dataTypes gates applicability; a
 * single '*' entry means every data type.
 */
export const filterOperatorMetaSchema = z.object({
  feValue: z.string(),
  filterTypes: z.array(z.string()),
  arity: z.enum(['none', 'one', 'two', 'many']),
  sqlTemplate: z.string().min(1),
  valueTransform: z
    .enum(['none', 'prefix', 'suffix', 'contains'])
    .optional()
    .default('none'),
  dataTypes: z.array(z.string()).min(1),
});
export type FilterOperatorMeta = z.infer<typeof filterOperatorMetaSchema>;
