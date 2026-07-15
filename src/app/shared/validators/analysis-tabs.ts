/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/analysis-tabs.ts
 *   FE: src/app/shared/validators/analysis-tabs.ts
 *
 * Single source of truth for the analysis-tab surface: create / update /
 * delete / reorder a named page inside an analysis (Track A2). Both the FE
 * tab-strip editor and the BE zodValidate middleware consume these schemas so
 * the contract can never drift between client and server.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Limits / patterns ──────────────────────────────────────────────

export const ANALYSIS_TAB_LIMITS = {
  NAME_MIN: 1,
  NAME_MAX: 120,
  ICON_MAX: 64,
  MAX_REORDER_ITEMS: 200,
  JUSTIFICATION_MAX: 500,
} as const;

/** Tab display name — same family as analysis / filter names. */
export const ANALYSIS_TAB_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length === 0 ? undefined : t;
  }
  return v;
};

const blankToUndefined = (v: unknown): unknown =>
  v === '' || v === null ? undefined : v;

const idSchema = (msg: string) =>
  z.string({ message: msg }).uuid({ message: msg });

// ── Field schemas ──────────────────────────────────────────────────

export const analysisTabNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.analysisTabs.name.required' })
    .min(ANALYSIS_TAB_LIMITS.NAME_MIN, {
      message: 'validation.analysisTabs.name.required',
    })
    .max(ANALYSIS_TAB_LIMITS.NAME_MAX, {
      message: 'validation.analysisTabs.name.tooLong',
    })
    .regex(ANALYSIS_TAB_NAME_PATTERN, {
      message: 'validation.analysisTabs.name.invalid',
    }),
);

/** Optional PrimeIcon class — blank collapses to undefined (→ stored null). */
export const analysisTabIconSchema = z
  .preprocess(
    blankToUndefined,
    z.string().max(ANALYSIS_TAB_LIMITS.ICON_MAX, {
      message: 'validation.analysisTabs.icon.tooLong',
    }),
  )
  .nullable()
  .optional();

export const analysisTabJustificationSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(ANALYSIS_TAB_LIMITS.JUSTIFICATION_MAX, {
      message: 'validation.analysisTabs.justification.tooLong',
    })
    .optional(),
);

// ── Payload schemas ────────────────────────────────────────────────

/** Create a tab. `analysisId` scopes it; org fields are re-derived on the BE. */
export const addAnalysisTabSchema = z.object({
  analysisId: idSchema('validation.analysisTabs.analysisId.required'),
  name: analysisTabNameSchema,
  icon: analysisTabIconSchema,
  sequence: z
    .number()
    .int({ message: 'validation.analysisTabs.sequence.invalid' })
    .min(0, { message: 'validation.analysisTabs.sequence.invalid' })
    .optional(),
});
export type AddAnalysisTabInput = z.infer<typeof addAnalysisTabSchema>;

/** Update a tab. PATCH semantics; `id` comes from the `:tabId` path param. */
export const updateAnalysisTabSchema = z.object({
  id: idSchema('validation.analysisTabs.id.required'),
  name: analysisTabNameSchema.optional(),
  icon: analysisTabIconSchema,
  sequence: z
    .number()
    .int({ message: 'validation.analysisTabs.sequence.invalid' })
    .min(0, { message: 'validation.analysisTabs.sequence.invalid' })
    .optional(),
  justification: analysisTabJustificationSchema,
});
export type UpdateAnalysisTabInput = z.infer<typeof updateAnalysisTabSchema>;

/**
 * Reorder — the full new ordering of tab ids after a drag. The BE verifies
 * every id belongs to the analysis before persisting the new `sequence` in one
 * transaction, so a foreign tab id can't be smuggled in.
 */
export const reorderAnalysisTabsSchema = z.object({
  analysisId: idSchema('validation.analysisTabs.analysisId.required'),
  orderedIds: z
    .array(idSchema('validation.analysisTabs.id.required'))
    .min(1, { message: 'validation.analysisTabs.reorder.atLeastOne' })
    .max(ANALYSIS_TAB_LIMITS.MAX_REORDER_ITEMS, {
      message: 'validation.analysisTabs.reorder.tooMany',
    }),
});
export type ReorderAnalysisTabsInput = z.infer<
  typeof reorderAnalysisTabsSchema
>;
