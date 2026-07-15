/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/favourites.ts
 *   FE: src/app/shared/validators/favourites.ts
 *
 * Single source of truth for the favourites surface: toggle a per-user star on
 * a viz object (Track F). Favourites are strictly personal — keyed on the
 * authenticated user server-side — so the schema carries only the object
 * coordinates (objectType + objectId), never a userId.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

/** The four object families that can be favourited. */
export const FAVOURITE_OBJECT_TYPES = [
  'dataset',
  'analysis',
  'dashboard',
  'alert',
] as const;
export type FavouriteObjectType = (typeof FAVOURITE_OBJECT_TYPES)[number];

// ── Field schemas ──────────────────────────────────────────────────

export const favouriteObjectTypeSchema = z.enum(FAVOURITE_OBJECT_TYPES, {
  message: 'validation.favourites.objectType.invalid',
});

const idSchema = (msg: string) =>
  z.string({ message: msg }).uuid({ message: msg });

// ── Payload schemas ────────────────────────────────────────────────

/**
 * Toggle a favourite — upsert-or-delete for the current user + objectType +
 * objectId. The BE derives the userId from the JWT (res.locals.loggedInId), so
 * a caller can never star on behalf of someone else.
 */
export const toggleFavouriteSchema = z.object({
  objectType: favouriteObjectTypeSchema,
  objectId: idSchema('validation.favourites.objectId.required'),
});
export type ToggleFavouriteInput = z.infer<typeof toggleFavouriteSchema>;
