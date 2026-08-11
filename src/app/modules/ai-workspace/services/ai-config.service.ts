import { Injectable, signal } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { AI_WORKSPACE } from 'src/app/core/constants/api.constant';
import { StorageService } from 'src/app/core/services/storage.service';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { environment } from 'src/environments/environment';

/** The org's AI config as returned by GET /ai/config (key masked). */
export interface AiConfig {
  aiEnabled: boolean;
  aiProvider: string | null;
  aiBaseUrl: string | null;
  aiModelId: string | null;
  aiTemperature: number | null;
  /** True when a key is stored — the key value itself never leaves the server. */
  aiApiKeyConfigured: boolean;
}

/** Health probe result — gates the launcher. */
export interface AiHealth {
  enabled: boolean;
  configured: boolean;
}

/**
 * AiConfigService — reads/writes the org's AI provider config (admin
 * settings tab) and exposes a cached health signal the launcher reads to
 * decide whether to show the "Ask AI" affordance.
 */
@Injectable({ providedIn: 'root' })
export class AiConfigService {
  private _config = signal<AiConfig | null>(null);
  private _saving = signal(false);
  private _health = signal<AiHealth | null>(null);

  readonly config = this._config.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly health = this._health.asReadonly();

  constructor(private http: HttpClientService) {}

  /** Load the config for the settings form. */
  load(): void {
    this.http
      .apiGet<{ data?: AiConfig }>(AI_WORKSPACE.CONFIG, { skipLoader: true })
      .subscribe({
        next: res => this._config.set(res?.data ?? null),
        error: () => this._config.set(null),
      });
  }

  /**
   * Save the config patch. The API key is omitted when the field still
   * holds the masked placeholder (empty string clears it) — the caller
   * decides what to send in `patch`.
   */
  save(patch: Partial<AiConfig> & { aiApiKey?: string }): void {
    this._saving.set(true);
    this.http.apiPut(AI_WORKSPACE.CONFIG, patch).subscribe({
      next: () => {
        this._saving.set(false);
        this.load();
        this.refreshHealth();
      },
      error: () => this._saving.set(false),
    });
  }

  /**
   * Probe whether AI is enabled + configured (drives the launcher gate).
   *
   * Seeds the health signal SYNCHRONOUSLY from the value the login response
   * stashed (session-build time), so the Dex launcher can gate itself on the
   * first paint without waiting for the network. Then confirms/refreshes from
   * /ai/health so a mid-session config change (admin toggles AI on/off) is
   * still picked up. When the stored value says "configured", we treat both
   * enabled + configured as true — the BE composite is identical.
   */
  refreshHealth(): void {
    if (this._health() === null) {
      const seeded = StorageService.get(StorageType.AI_CONFIGURED) === 'true';
      this._health.set({ enabled: seeded, configured: seeded });
    }
    // Probe the DBExec-AI BFF's health when configured (absolute URL + token,
    // since the interceptor skips auth on absolute URLs); else the main API's
    // embedded /ai/health via the interceptor.
    const ai = environment.aiServer;
    const req = ai
      ? this.http.apiGet<{ data?: AiHealth }>(
          `${ai.replace(/\/+$/, '')}/ai/health`,
          {
            skipLoader: true,
            headers: new HttpHeaders({
              'x-auth-token': StorageService.get(StorageType.ACCESS_TOKEN) || '',
            }),
          },
        )
      : this.http.apiGet<{ data?: AiHealth }>(AI_WORKSPACE.HEALTH, {
          skipLoader: true,
        });
    req.subscribe({
      next: res =>
        this._health.set(res?.data ?? { enabled: false, configured: false }),
      error: () => {
        // Keep the seeded value on a probe failure rather than forcing the
        // launcher to disappear on a transient network blip.
      },
    });
  }
}
