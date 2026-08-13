/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/system-users.ts
 *   FE: src/app/shared/validators/system-users.ts
 *
 * Workflow when changing a rule:
 *   - Edit BOTH files (BE and FE) in the SAME feature PR. Code
 *     review on both repos catches drift.
 *
 * See organisation.ts for the convention overview (mirrored vs BE-only
 * vs FE-only file naming, translation-key contract).
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';
import {
  bulkAddUserCommitSchema,
  bulkUserRowSchema,
  listUserQuerySchema,
  updatePasswordSchema,
} from './users';

// ── System-user schemas ──────────────────────────────────────────────
// System users (master DB) reuse the same shape as org users,
// so these are just re-exports from users.ts to keep the modules clean.

/** Per-row schema from CSV bulk upload (system users). */
export const bulkSystemUserRowSchema = bulkUserRowSchema;
export type BulkSystemUserRow = z.infer<typeof bulkSystemUserRowSchema>;

/** Commit schema for bulk system user creation. */
export const bulkAddSystemUserCommitSchema = bulkAddUserCommitSchema;
export type BulkAddSystemUserCommitInput = z.infer<
  typeof bulkAddSystemUserCommitSchema
>;

/** List system users query schema. */
export const listSystemUserQuerySchema = listUserQuerySchema;
export type ListSystemUserQuery = z.infer<typeof listSystemUserQuerySchema>;

/** Update system user password schema. */
export const updateSystemUserPasswordSchema = updatePasswordSchema;
export type UpdateSystemUserPasswordInput = z.infer<
  typeof updateSystemUserPasswordSchema
>;
