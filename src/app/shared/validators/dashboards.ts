/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/dashboards.ts
 *   FE: src/app/shared/validators/dashboards.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import { buildSortZod } from '../utility/listSort';

// ── Sort field whitelist ───────────────────────────────────────────────

export const DASHBOARD_LIST_SORT_FIELDS = [
  'name',
  'status',
  'createdOn',
] as const;
export type DashboardListSortField =
  (typeof DASHBOARD_LIST_SORT_FIELDS)[number];

// ── GetDistinctDashboardFieldValues body schema ─────────────────────────

export const getDistinctDashboardFieldValuesSchema = z.object({
  fieldName: z
    .string({ message: 'validation.dashboards.fieldName.required' })
    .trim()
    .min(1, { message: 'validation.dashboards.fieldName.tooShort' })
    .max(256, { message: 'validation.dashboards.fieldName.tooLong' }),
  search: z
    .string()
    .max(256, { message: 'validation.dashboards.search.tooLong' })
    .optional(),
  page: z.coerce
    .number({ message: 'validation.dashboards.page.invalid' })
    .int()
    .min(1, { message: 'validation.dashboards.page.invalid' })
    .optional(),
  pageSize: z.coerce
    .number({ message: 'validation.dashboards.pageSize.invalid' })
    .int()
    .min(1, { message: 'validation.dashboards.pageSize.invalid' })
    .max(500, { message: 'validation.dashboards.pageSize.tooLarge' })
    .optional(),
});

// ── ListDashboard query schema ─────────────────────────────────────────

export const listDashboardSchema = z
  .object({
    datasourceId: z.string().optional(),
    page: z.coerce
      .number({ message: 'validation.dashboards.page.invalid' })
      .int()
      .min(1, { message: 'validation.dashboards.page.invalid' })
      .optional(),
    limit: z.coerce
      .number({ message: 'validation.dashboards.limit.invalid' })
      .int()
      .min(1, { message: 'validation.dashboards.limit.invalid' })
      .max(1000, { message: 'validation.dashboards.limit.tooLarge' })
      .optional(),
    filter: z.string().optional(),
    sort: buildSortZod(DASHBOARD_LIST_SORT_FIELDS),
    sourceAnalysisId: z
      .string({ message: 'validation.dashboards.sourceAnalysisId.invalid' })
      .uuid({ message: 'validation.dashboards.sourceAnalysisId.invalid' })
      .optional(),
  })
  .strict();
