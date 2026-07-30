/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/assetShares.ts
 *   FE: src/app/shared/validators/assetShares.ts
 *
 * Single source of truth for the asset-sharing surface: grant (create /
 * upsert) an access grant, bulk-grant several at once, and change a grant's
 * level. Both the FE dialog and the BE zodValidate middleware consume these
 * schemas so the contract can never drift between client and server.
 *
 * An asset (dataset / analysis / dashboard) is shared to a grantee (a user or
 * a group) at a permission level (edit or view). assetId / granteeId / the
 * grant id all come from the URL or are resolved server-side; the body carries
 * only the grant coordinates + level.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

/** The three asset families that can be shared. */
export const ASSET_SHARE_ASSET_TYPES = [
  'dataset',
  'analysis',
  'dashboard',
  'querybuilder',
] as const;
export type AssetShareAssetType = (typeof ASSET_SHARE_ASSET_TYPES)[number];

/** A grant targets either a single user or a group of users. */
export const ASSET_SHARE_GRANTEE_TYPES = ['user', 'group'] as const;
export type AssetShareGranteeType = (typeof ASSET_SHARE_GRANTEE_TYPES)[number];

/**
 * Sharing is VIEW-ONLY. A share grant confers read + run access and nothing
 * more. Edit/delete authority belongs to the asset's creator or an org admin
 * (never conferred by a share) — a shared-with user who wants to change an
 * asset duplicates it. 'view' is retained as the single level so the grant
 * payload keeps a stable shape (rather than dropping the field entirely).
 */
export const ASSET_SHARE_PERMISSIONS = ['view'] as const;
export type AssetSharePermission = (typeof ASSET_SHARE_PERMISSIONS)[number];

export const ASSET_SHARE_LIMITS = {
  BULK_MAX: 100,
} as const;

// ── Field schemas ────────────────────────────────────────────────────

export const assetShareAssetTypeSchema = z.enum(ASSET_SHARE_ASSET_TYPES, {
  message: 'validation.assetShares.assetType.invalid',
});

export const assetShareGranteeTypeSchema = z.enum(ASSET_SHARE_GRANTEE_TYPES, {
  message: 'validation.assetShares.granteeType.invalid',
});

export const assetSharePermissionSchema = z.enum(ASSET_SHARE_PERMISSIONS, {
  message: 'validation.assetShares.permission.invalid',
});

export const assetShareGranteeIdSchema = z
  .string({ message: 'validation.assetShares.granteeId.required' })
  .uuid({ message: 'validation.assetShares.granteeId.invalid' });

// ── Payload schemas ──────────────────────────────────────────────────

/** One grant. assetType + assetId come from the URL, not the body. */
export const addAssetShareSchema = z.object({
  granteeType: assetShareGranteeTypeSchema,
  granteeId: assetShareGranteeIdSchema,
  permission: assetSharePermissionSchema,
});
export type AddAssetShareInput = z.infer<typeof addAssetShareSchema>;

/** Bulk grant — the dialog's "Add" adds several recipients in one call. */
export const bulkAddAssetShareSchema = z.object({
  grants: z
    .array(addAssetShareSchema, {
      message: 'validation.assetShares.grants.required',
    })
    .min(1, { message: 'validation.assetShares.grants.required' })
    .max(ASSET_SHARE_LIMITS.BULK_MAX, {
      message: 'validation.assetShares.grants.tooMany',
    }),
});
export type BulkAddAssetShareInput = z.infer<typeof bulkAddAssetShareSchema>;

/** Change a grant's level. id comes from the URL param, not the body. */
export const updateAssetShareSchema = z.object({
  permission: assetSharePermissionSchema,
});
export type UpdateAssetShareInput = z.infer<typeof updateAssetShareSchema>;
