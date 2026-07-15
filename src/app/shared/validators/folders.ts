/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/folders.ts
 *   FE: src/app/shared/validators/folders.ts
 *
 * Single source of truth for the folders surface: create / rename / move a
 * node in the per-objectType organizational tree (Track F). Both the FE
 * folder-tree editor and the BE zodValidate middleware consume these schemas
 * so the contract can never drift between client and server.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Limits / patterns ──────────────────────────────────────────────

export const FOLDER_LIMITS = {
  NAME_MIN: 1,
  NAME_MAX: 120,
} as const;

/** The four object families a folder tree can organize. */
export const FOLDER_OBJECT_TYPES = [
  'dataset',
  'analysis',
  'dashboard',
  'alert',
] as const;
export type FolderObjectType = (typeof FOLDER_OBJECT_TYPES)[number];

/** Folder display name — same family as analysis / tab names. */
export const FOLDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

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

export const folderNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.folders.name.required' })
    .min(FOLDER_LIMITS.NAME_MIN, {
      message: 'validation.folders.name.required',
    })
    .max(FOLDER_LIMITS.NAME_MAX, {
      message: 'validation.folders.name.tooLong',
    })
    .regex(FOLDER_NAME_PATTERN, {
      message: 'validation.folders.name.invalid',
    }),
);

export const folderObjectTypeSchema = z.enum(FOLDER_OBJECT_TYPES, {
  message: 'validation.folders.objectType.invalid',
});

/**
 * Parent id — optional; `null` / blank collapses to undefined (→ a root
 * folder). When present it must be a uuid.
 */
export const folderParentIdSchema = z
  .preprocess(
    blankToUndefined,
    idSchema('validation.folders.parentId.invalid'),
  )
  .nullable()
  .optional();

// ── Payload schemas ────────────────────────────────────────────────

/** Create a folder. objectType picks the tree; parentId nests it. */
export const createFolderSchema = z.object({
  name: folderNameSchema,
  objectType: folderObjectTypeSchema,
  parentId: folderParentIdSchema,
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

/** Rename a folder — name only; id comes from the `:folderId` path param. */
export const renameFolderSchema = z.object({
  name: folderNameSchema,
});
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;

/**
 * Move a folder — reparent under a new parent (or to the root when parentId
 * is omitted / null). The BE guards against cycles (a folder can't become its
 * own descendant) before persisting.
 */
export const moveFolderSchema = z.object({
  parentId: folderParentIdSchema,
});
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;
