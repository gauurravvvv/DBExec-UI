import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { ASSET_SHARE } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { AssetSharePermission } from 'src/app/shared/validators/assetShares';

/** One access grant as returned by the list endpoint. */
export interface AssetShareGrant {
  id: string;
  granteeType: 'user' | 'group';
  granteeId: string;
  granteeName: string;
  granteeEmail?: string | null;
  permission: AssetSharePermission;
  createdOn?: string;
}

/** The asset owner (pinned at the top of the "who has access" list). */
export interface AssetShareOwner {
  userId: string;
  name: string;
  email: string | null;
}

/** One recipient to grant in a bulk add. */
export interface AssetShareGrantInput {
  granteeType: 'user' | 'group';
  granteeId: string;
  permission: AssetSharePermission;
}

/**
 * AssetShareService — grant / list / change-level / revoke access on a
 * dataset, analysis, or dashboard. One generic service for all three
 * families (assetType is passed per call). Signal-based state; every call
 * routes through HttpClientService with { skipLoader: true } and the dialog
 * renders its own spinners.
 */
@Injectable({
  providedIn: 'root',
})
export class AssetShareService {
  private _owner = signal<AssetShareOwner | null>(null);
  private _shares = signal<AssetShareGrant[]>([]);
  private _loading = signal(false);
  private _saving = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so a dialog can cancel in-flight GETs on
  // close / destroy.
  private _cancelReads$ = new Subject<void>();

  readonly owner = this._owner.asReadonly();
  readonly shares = this._shares.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly deleting = this._deleting.asReadonly();

  isDeleting(id: string): boolean {
    return !!this._deleting()[id];
  }
  private setDeleting(id: string, on: boolean): void {
    const map = { ...this._deleting() };
    if (on) map[id] = true;
    else delete map[id];
    this._deleting.set(map);
  }

  constructor(private http: HttpClientService) {}

  cancelReads(): void {
    this._cancelReads$.next();
  }

  reset(): void {
    this._owner.set(null);
    this._shares.set([]);
  }

  /** `/asset-shares/${assetType}/${assetId}/shares` */
  private sharesUrl(assetType: string, assetId: string): string {
    return (
      ASSET_SHARE.SHARES_PREFIX +
      assetType +
      '/' +
      assetId +
      ASSET_SHARE.SHARES_SUFFIX
    );
  }

  /** GET who-has-access for one asset → { owner, shares }. */
  async loadShares(assetType: string, assetId: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.sharesUrl(assetType, assetId), { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._owner.set(res.data?.owner ?? null);
        this._shares.set(res.data?.shares ?? []);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /** POST bulk grant several recipients at once. */
  async addShares(
    assetType: string,
    assetId: string,
    grants: AssetShareGrantInput[],
  ) {
    this._saving.set(true);
    try {
      const url =
        ASSET_SHARE.SHARES_PREFIX +
        assetType +
        '/' +
        assetId +
        ASSET_SHARE.BULK_SUFFIX;
      return await lastValueFrom(
        this.http.apiPost(url, { grants }, { skipLoader: true }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /** PUT change one grant's level. */
  async updateShare(shareId: string, permission: AssetSharePermission) {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(
          ASSET_SHARE.SHARE_BY_ID + shareId,
          { permission },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /** DELETE revoke one grant. */
  async revokeShare(shareId: string) {
    this.setDeleting(shareId, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ASSET_SHARE.SHARE_BY_ID + shareId, {
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(shareId, false);
    }
  }
}
