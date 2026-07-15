/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/favourites.ts
 *   FE: src/app/shared/validators/favourites.ts
 *
 * Single source of truth for the favourites surface (Track F2): toggle a
 * per-user star on a viz object, and list the current user's favourites for
 * one object family. Favourites are strictly personal — keyed on the logged-in
 * user (`res.locals.loggedInId` on the BE), never org-shared, never snapshotted.
 * Both the FE star toggle and the BE zodValidate middleware consume these
 * schemas so the client / server contract can never drift.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Object families ─────────────────────────────────────────────────

/** The four object families a favourite can point at. */
export const FAVOURITE_OBJECT_TYPES = [
  'dataset',
  'analysis',
  'dashboard',
  'alert',
] as const;
export type FavouriteObjectType = (typeof FAVOURITE_OBJECT_TYPES)[number];

// ── Internal helpers ────────────────────────────────────────────────

const idSchema = (msg: string) =>
  z.string({ message: msg }).uuid({ message: msg });

// ── Field schemas ───────────────────────────────────────────────────

export const favouriteObjectTypeSchema = z.enum(FAVOURITE_OBJECT_TYPES, {
  message: 'validation.favourites.objectType.invalid',
});

// ── Payload schemas ─────────────────────────────────────────────────

/**
 * Toggle a favourite — upserts (star) or deletes (un-star) the row for
 * (loggedInUser, objectType, objectId). The BE returns the resulting state
 * (`{ favourited: boolean }`) so the FE can update the star without a re-list.
 */
export const toggleFavouriteSchema = z.object({
  objectType: favouriteObjectTypeSchema,
  objectId: idSchema('validation.favourites.objectId.required'),
});
export type ToggleFavouriteInput = z.infer<typeof toggleFavouriteSchema>;

/**
 * List the current user's favourites, optionally filtered to one object
 * family. Returned as the set of favourited `objectId`s the caller owns.
 */
export const listFavouritesSchema = z.object({
  objectType: favouriteObjectTypeSchema.optional(),
});
export type ListFavouritesInput = z.infer<typeof listFavouritesSchema>;
