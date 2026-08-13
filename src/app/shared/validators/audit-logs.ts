/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/audit-logs.ts
 *   FE: src/app/shared/validators/audit-logs.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import { buildSortZod } from '../utility/listSort';

// ── Sort field whitelist ───────────────────────────────────────────────

export const AUDIT_LOG_LIST_SORT_FIELDS = ['action', 'createdOn'] as const;
export type AuditLogListSortField = (typeof AUDIT_LOG_LIST_SORT_FIELDS)[number];

// ── GetAuditLog param schema ───────────────────────────────────────────

export const getAuditLogSchema = z.object({
  id: z
    .string({ message: 'validation.common.id.required' })
    .trim()
    .uuid({ message: 'validation.common.id.invalid' }),
});

// ── ListAuditLog query schema ──────────────────────────────────────────

export const listAuditLogSchema = z
  .object({
    page: z.coerce
      .number({ message: 'validation.auditLogs.page.invalid' })
      .int()
      .min(1, { message: 'validation.auditLogs.page.invalid' })
      .optional(),
    limit: z.coerce
      .number({ message: 'validation.auditLogs.limit.invalid' })
      .int()
      .min(1, { message: 'validation.auditLogs.limit.invalid' })
      .max(1000, { message: 'validation.auditLogs.limit.tooLarge' })
      .optional(),
    filter: z.string().optional(),
    sort: buildSortZod(AUDIT_LOG_LIST_SORT_FIELDS),
  })
  .strict();
