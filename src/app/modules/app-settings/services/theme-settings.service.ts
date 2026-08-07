import { Injectable, inject, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { THEME } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { ThemePayload } from 'src/app/core/services/theme.service';

/** One palette in the org's theme library. */
export interface ThemePreset {
  id: string;
  name: string;
  description?: string | null;
  colors: Record<string, string>;
  isActive: boolean;
  isSeeded: boolean;
  sortOrder: number;
  createdOn?: string;
  updatedOn?: string;
}

/**
 * ThemeSettingsService — the Theme tab's data layer.
 *
 * Holds the org's preset library + the active theme colours. Editing in
 * the tab's colour editor saves to the ACTIVE preset (`save`); the
 * gallery lists presets and switches the active one (`activatePreset`).
 * Persisted changes apply to everyone on their next sign-in — the
 * editing admin sees a live preview locally via ThemeService, but the
 * server-side switch is what other users get.
 */
@Injectable({ providedIn: 'root' })
export class ThemeSettingsService {
  private readonly http = inject(HttpClientService);

  private _current = signal<ThemePayload | null>(null);
  private _presets = signal<ThemePreset[]>([]);
  private _loading = signal(false);
  private _saving = signal(false);
  private _busyPresetId = signal<string | null>(null);

  readonly current = this._current.asReadonly();
  readonly presets = this._presets.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  /** Id of the preset a switch/edit/delete is currently running for. */
  readonly busyPresetId = this._busyPresetId.asReadonly();

  private _cancelReads$ = new Subject<void>();

  /** Active theme colours (for the editor form). */
  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(THEME.GET, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /** The org's preset library, for the picker gallery. */
  async loadPresets(): Promise<void> {
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(THEME.PRESETS, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status && Array.isArray(res.data)) this._presets.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    }
  }

  /** Save the editor's colours into the active preset. */
  async save(payload: Partial<ThemePayload>): Promise<any> {
    this._saving.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(THEME.SAVE, payload, { skipLoader: true }),
      );
      return res;
    } finally {
      this._saving.set(false);
    }
  }

  /** Quick-switch — make a preset the org's active theme. */
  async activatePreset(id: string): Promise<any> {
    this._busyPresetId.set(id);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(THEME.activatePreset(id), {}, { skipLoader: true }),
      );
      if (res?.status) await this.loadPresets();
      return res;
    } finally {
      this._busyPresetId.set(null);
    }
  }

  /** One preset by id (for the edit/view page). */
  async getPreset(id: string): Promise<ThemePreset | null> {
    const res: any = await lastValueFrom(
      this.http.apiGet(THEME.preset(id), { skipLoader: true }),
    );
    return res?.status ? (res.data as ThemePreset) : null;
  }

  createPreset(body: {
    name: string;
    description?: string;
    colors: Record<string, string>;
  }): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(THEME.PRESETS, body, { skipLoader: true }),
    );
  }

  updatePreset(
    id: string,
    body: { name?: string; description?: string; colors?: Record<string, string> },
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiPut(THEME.preset(id), body, { skipLoader: true }),
    );
  }

  async deletePreset(id: string): Promise<any> {
    this._busyPresetId.set(id);
    try {
      const res: any = await lastValueFrom(
        this.http.apiDelete(THEME.preset(id), { skipLoader: true }),
      );
      if (res?.status) await this.loadPresets();
      return res;
    } finally {
      this._busyPresetId.set(null);
    }
  }

  cancelReads(): void {
    this._cancelReads$.next();
  }
}
