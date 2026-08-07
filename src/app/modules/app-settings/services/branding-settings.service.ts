import { Injectable, inject, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { BRANDING } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * Payload returned by `GET /branding` and accepted by `POST /branding`.
 * Mirrors the BE shape exactly — only the watermark slice of the
 * Theme row is exposed here. Colour palette fields are owned by
 * ThemeSettingsService.
 */
export interface BrandingPayload {
  showWatermark: boolean;
  watermarkText: string | null;
  watermarkBgColor: string | null;
  watermarkTextColor: string | null;
}

/** One watermark preset in the org's branding library. */
export interface BrandingPreset {
  id: string;
  name: string;
  description?: string | null;
  showWatermark: boolean;
  watermarkText: string | null;
  watermarkBgColor: string | null;
  watermarkTextColor: string | null;
  isActive: boolean;
  sortOrder: number;
  createdOn?: string;
  updatedOn?: string;
}

/**
 * BrandingSettingsService — settings-form-facing CRUD for the org's
 * watermark configuration.
 *
 * Same cancellation + lifecycle conventions as ThemeSettingsService:
 * reads pipe through _cancelReads$ so the form component can abort
 * an in-flight GET on ngOnDestroy; the save call does not pipe (half-
 * applied writes are worse than letting the request finish).
 *
 * Saving here does NOT repaint the current session's watermark — the
 * editing admin sees the new branding on their next sign-in, same
 * contract as the colour palette. The login response and the
 * refresh-token response both carry the resolved branding inline.
 */
@Injectable({ providedIn: 'root' })
export class BrandingSettingsService {
  private readonly http = inject(HttpClientService);

  private _current = signal<BrandingPayload | null>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  private _cancelReads$ = new Subject<void>();

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(BRANDING.GET, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async save(payload: BrandingPayload): Promise<any> {
    this._saving.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(BRANDING.SAVE, payload, { skipLoader: true }),
      );
      if (res?.status && res?.data) {
        this._current.set(res.data);
      }
      return res;
    } finally {
      this._saving.set(false);
    }
  }

  // ── Preset library ──────────────────────────────────────────
  private _busyPresetId = signal<string | null>(null);
  readonly busyPresetId = this._busyPresetId.asReadonly();

  /** Paged preset list for the app-custom-table server adapter (same
   *  contract as the users list). */
  listPresets(params: {
    page: number;
    limit: number;
    filter?: string;
    sort?: string;
  }): any {
    const qp = new URLSearchParams();
    qp.set('page', String(params.page));
    qp.set('limit', String(params.limit));
    if (params.filter) qp.set('filter', params.filter);
    if (params.sort) qp.set('sort', params.sort);
    return this.http.apiGet(`${BRANDING.PRESETS}?${qp.toString()}`, {
      skipLoader: true,
    });
  }

  async getPreset(id: string): Promise<BrandingPreset | null> {
    const res: any = await lastValueFrom(
      this.http.apiGet(BRANDING.preset(id), { skipLoader: true }),
    );
    return res?.status ? (res.data as BrandingPreset) : null;
  }

  createPreset(body: Partial<BrandingPreset>): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(BRANDING.PRESETS, body, { skipLoader: true }),
    );
  }

  updatePreset(id: string, body: Partial<BrandingPreset>): Promise<any> {
    return lastValueFrom(
      this.http.apiPut(BRANDING.preset(id), body, { skipLoader: true }),
    );
  }

  async activatePreset(id: string): Promise<any> {
    this._busyPresetId.set(id);
    try {
      return await lastValueFrom(
        this.http.apiPost(BRANDING.activatePreset(id), {}, { skipLoader: true }),
      );
    } finally {
      this._busyPresetId.set(null);
    }
  }

  async deletePreset(id: string): Promise<any> {
    this._busyPresetId.set(id);
    try {
      return await lastValueFrom(
        this.http.apiDelete(BRANDING.preset(id), { skipLoader: true }),
      );
    } finally {
      this._busyPresetId.set(null);
    }
  }

  cancelReads(): void {
    this._cancelReads$.next();
  }
}
