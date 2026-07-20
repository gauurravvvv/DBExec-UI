/**
 * Client-side shape of an audit-log row — mirrors the BE `mapAuditRow`
 * contract EXACTLY. The model is name-denormalized: `actorName` and
 * `entityName` are frozen on the row at write-time, so a later DELETE of the
 * actor/entity still renders their name. `actorId` / `entityId` are carried
 * only for row-keying and are NEVER rendered as display text.
 */

/** Diff row precomputed by the BE — labels are human-readable, values are
 *  already resolved to NAMES (never ids). */
export interface AuditChangedField {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
}

/**
 * Result of a tamper-evidence hash-chain verification (BE `GET
 * /audit-logs/verify` + `/login-activity/verify`). `ok` true = the whole
 * walked chain is intact; otherwise `brokenAt` names the first tampered row.
 */
export interface ChainVerifyResult {
  ok: boolean;
  verifiedCount: number;
  brokenAt: { id: string; createdOn: string } | null;
  reason: string | null;
}

export type AuditActorType = 'user' | 'system-admin' | 'system';

export interface AuditLog {
  id: string;
  /** Internal only — NEVER displayed as text. */
  actorId: string | null;
  /** Denormalized actor display name. Null → UI shows "Unknown user".
   *  'System Admin' already comes through for the system-admin sentinel. */
  actorName: string | null;
  actorType: AuditActorType;
  organisationId?: string | null;
  module: string;
  action: string;
  entityType: string | null;
  /** Internal only — NEVER displayed as text. */
  entityId: string | null;
  entityName: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  changedFields: AuditChangedField[] | null;
  requestMethod: string | null;
  requestPath: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  responseSuccess: boolean | null;
  justification: string | null;
  correlationId: string | null;
  createdOn: string;
}
