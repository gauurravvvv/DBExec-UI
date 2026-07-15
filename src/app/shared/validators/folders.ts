/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/folders.ts
 *   FE: src/app/shared/validators/folders.ts
 *
 * Single source of truth for the folders surface (Track F2): create /
 * rename / move / delete / list-tree of the nested organizational tree that
 * groups datasets / analyses / dashboards / alerts. One tree per `objectType`
 * per organisation; `parentId` builds the hierarchy (null = a root folder).
 * Both the FE folder-tree panel and the BE zodValidate middleware consume
 * these schemas so the client / server contract can never drift.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Limits / patterns ──────────────────────────────────────────────

export const FOLDER_LIMITS = {
  NAME_MIN: 1,
  NAME_MAX: 120,
  JUSTIFICATION_MAX: 500,
} as const;

/** The four object families a folder tree can organize. */
export const FOLDER_OBJECT_TYPES = [
  'dataset',
  'analysis',
  'dashboard',
  'alert',
] as const;
export type FolderObjectType = (typeof FOLDER_OBJECT_TYPES)[number];

/** Folder display name — same family as analysis / tab / filter names. */
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

/** Parent folder id — blank / null collapses to undefined (→ a root folder). */
export const folderParentIdSchema = z
  .preprocess(
    blankToUndefined,
    idSchema('validation.folders.parentId.invalid'),
  )
  .nullable()
  .optional();

export const folderJustificationSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(FOLDER_LIMITS.JUSTIFICATION_MAX, {
      message: 'validation.folders.justification.tooLong',
    })
    .optional(),
);

// ── Payload schemas ────────────────────────────────────────────────

/** Create a folder. `objectType` scopes the tree; org fields re-derived on BE. */
export const createFolderSchema = z.object({
  name: folderNameSchema,
  objectType: folderObjectTypeSchema,
  parentId: folderParentIdSchema,
  sequence: z
    .number()
    .int({ message: 'validation.folders.sequence.invalid' })
    .min(0, { message: 'validation.folders.sequence.invalid' })
    .optional(),
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

/** Rename a folder. `id` comes from the `:folderId` path param. */
export const renameFolderSchema = z.object({
  id: idSchema('validation.folders.id.required'),
  name: folderNameSchema,
});
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;

/**
 * Move (reparent) a folder. `parentId` null = move to root. The BE guards
 * against cycles (a folder cannot become its own descendant) before persisting.
 */
export const moveFolderSchema = z.object({
  id: idSchema('validation.folders.id.required'),
  parentId: folderParentIdSchema,
  sequence: z
    .number()
    .int({ message: 'validation.folders.sequence.invalid' })
    .min(0, { message: 'validation.folders.sequence.invalid' })
    .optional(),
});
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;

/** Delete a folder. Detaches its objects (folderId → null) per the BE. */
export const deleteFolderSchema = z.object({
  id: idSchema('validation.folders.id.required'),
  justification: folderJustificationSchema,
});
export type DeleteFolderInput = z.infer<typeof deleteFolderSchema>;

/**
 * Move an object into a folder (or to root when folderId is null). The BE
 * verifies the folder belongs to the same org + objectType before persisting.
 */
export const moveObjectToFolderSchema = z.object({
  objectType: folderObjectTypeSchema,
  objectId: idSchema('validation.folders.objectId.required'),
  folderId: z
    .preprocess(blankToUndefined, idSchema('validation.folders.id.required'))
    .nullable()
    .optional(),
});
export type MoveObjectToFolderInput = z.infer<typeof moveObjectToFolderSchema>;
