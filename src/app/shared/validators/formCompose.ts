/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/formCompose.ts
 *   FE: src/app/shared/validators/formCompose.ts
 *
 * formCompose — runtime tree validators for the published-form Query Builder.
 *
 * Reuses the query-builder tree schema VERBATIM (executeQueryBuilderSchema); only
 * the top-level id field is relabelled `formId` (accepted as an optional alias —
 * the runtime controller keys off the /forms/:formId path param regardless, never
 * the body). This is what lets a form's condition tree flow through the exact same
 * validateTree → compile pipeline as a Query Builder v2 tree.
 *
 * The FE composer (fb-compose / FormRuntimeStore) safeParses the tree with the
 * same schema the BE re-validates, so the shape can never drift.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import { executeQueryBuilderSchema } from './queryBuilderTree';

/**
 * The composer sends the form id in `formId` (or the legacy `queryBuilderId`
 * slot). queryBuilderId is required by the reused schema, so it is relaxed to
 * optional here; the controller uses the path param as the authoritative id.
 */
export const composeSchema = executeQueryBuilderSchema.extend({
  queryBuilderId: z.string().uuid().optional(),
  formId: z.string().uuid().optional(),
});

/**
 * validate / execute / count may also carry a `values` map (fieldKey → value)
 * so the server can re-run the Phase-5 rule enforcement over the submission.
 */
export const validateComposeSchema = composeSchema.extend({
  values: z.record(z.string(), z.any()).optional(),
});

export type ComposeBody = z.infer<typeof composeSchema>;
export type ValidateComposeBody = z.infer<typeof validateComposeSchema>;
