/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (DBExec-API ↔ DBExec-UI). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/analysis-filters.ts
 *   FE: src/app/shared/validators/analysis-filters.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Request item schema for batch fetch ──────────────────────────────

/** Parent constraint (column + values) for cascading filters. */
const parentConstraintSchema = z.object({
  column: z
    .string({
      message: 'validation.analysisFilters.parentConstraints.column.required',
    })
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      message: 'validation.analysisFilters.parentConstraints.column.invalid',
    }),
  values: z
    .array(z.any())
    .max(1000, {
      message: 'validation.analysisFilters.parentConstraints.values.tooMany',
    })
    .nonempty({
      message: 'validation.analysisFilters.parentConstraints.values.required',
    }),
});

/** A single filter request item in the batch. */
const requestItemSchema = z.object({
  filterId: z.string().uuid({
    message: 'validation.analysisFilters.filterId.invalid',
  }),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
  parentConstraints: z
    .array(parentConstraintSchema)
    .max(20, {
      message: 'validation.analysisFilters.parentConstraints.tooMany',
    })
    .optional(),
  parentSelections: z
    .record(z.string(), z.array(z.any()))
    .optional(),
});

// ── Main batch schema ────────────────────────────────────────────────

/**
 * GetFilterValuesBatchSchema — validates the POST /analysis-filter/values
 * request body. Supports two modes:
 *   - 'open': derive filter list from analysisId, requests optional
 *   - 'fetch': requires explicit requests array
 */
export const getFilterValuesBatchSchema = z
  .object({
    analysisId: z.string().uuid({
      message: 'validation.analysisFilters.analysisId.invalid',
    }),
    mode: z
      .enum(['open', 'fetch'], {
        message: 'validation.analysisFilters.mode.invalid',
      })
      .default('fetch'),
    requests: z.array(requestItemSchema).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    // In fetch mode, requests is required and must have at least one item.
    if (data.mode === 'fetch') {
      if (
        !Array.isArray(data.requests) ||
        data.requests.length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['requests'],
          message: 'validation.analysisFilters.requests.required',
        });
      }
    }
  });

export type GetFilterValuesBatchInput = z.infer<
  typeof getFilterValuesBatchSchema
>;
