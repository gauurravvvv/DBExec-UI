import { Injectable, signal } from '@angular/core';
import { EmptyError, lastValueFrom } from 'rxjs';
import { FAVOURITE } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import type { FavouriteObjectType } from 'src/app/shared/validators/favourites';

/**
 * FavouritesService — the per-user star toggle + list used by the favourite
 * column on every object list and the star on every view screen. Backed by the
 * BE favourites routes (spec §5.6):
 *
 *   POST /favourites/toggle   toggleFavourite (body: objectType, objectId) → { favourited }
 *   GET  /favourites          listFavourites  (the caller's favourited object ids)
 *
 * Favourites are strictly per-user, so there's no org param. A per-objectType
 * in-memory `Set` of favourited ids is exposed as a signal so lists can render
 * the correct star state after one `refresh()` without re-fetching per row.
 * Toggling is optimistic-friendly: callers can flip the local set immediately
 * and reconcile with the returned `favourited` flag.
 */
@Injectable({ providedIn: 'root' })
export class FavouritesService {
  /** objectType → Set of favourited objectIds for the current user. */
  private _ids = signal<Record<string, Set<string>>>({});
  readonly ids = this._ids.asReadonly();

  private _saving = signal(false);
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  /** Is this object currently a favourite in the cached set? */
  isFavourite(objectType: FavouriteObjectType, objectId: string): boolean {
    return !!this._ids()[objectType]?.has(objectId);
  }

  private setLocal(
    objectType: FavouriteObjectType,
    objectId: string,
    on: boolean,
  ): void {
    const map = { ...this._ids() };
    const set = new Set(map[objectType] ?? []);
    if (on) set.add(objectId);
    else set.delete(objectId);
    map[objectType] = set;
    this._ids.set(map);
  }

  /**
   * Refresh the cached favourite-id set for one object family. Call once when
   * a list loads so every row's star reflects the true state.
   */
  async refresh(objectType: FavouriteObjectType): Promise<void> {
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(FAVOURITE.LIST, {
          params: { objectType },
          skipLoader: true,
        }),
      );
      if (res?.status) {
        // BE returns either a bare id array or `{ favourites: [{objectId}] }`.
        const raw = res.data?.favourites ?? res.data ?? [];
        const ids: string[] = Array.isArray(raw)
          ? raw.map((r: any) => (typeof r === 'string' ? r : r?.objectId))
          : [];
        const map = { ...this._ids() };
        map[objectType] = new Set(ids.filter(Boolean));
        this._ids.set(map);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    }
  }

  /**
   * Toggle a favourite. Updates the local set from the BE's returned
   * `favourited` flag (falling back to a local flip if the flag is absent) and
   * returns the raw response so callers can surface a toast.
   */
  async toggle(
    objectType: FavouriteObjectType,
    objectId: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(
          FAVOURITE.TOGGLE,
          { objectType, objectId },
          { skipLoader: true },
        ),
      );
      if (res?.status) {
        const favourited =
          typeof res.data?.favourited === 'boolean'
            ? res.data.favourited
            : !this.isFavourite(objectType, objectId);
        this.setLocal(objectType, objectId, favourited);
      }
      return res;
    } finally {
      this._saving.set(false);
    }
  }
}
