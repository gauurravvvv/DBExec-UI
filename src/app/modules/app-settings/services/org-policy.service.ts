import { Injectable, inject, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { ORG_POLICY } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * Shape of the org-policy GET response — mirrors the OrgPolicy entity
 * on the per-org DB. Sensitive ciphertext fields (smtpPassword,
 * sesSecretAccessKey) are never returned by the BE; the FE shows a
 * "Configured" badge instead, derived from the *Configured booleans.
 */
export interface OrgPolicyPayload {
  // Security
  maxLoginAttempts: number;
  accountLockDurationHours: number;
  passwordHistoryLimit: number;
  sessionInactivityTimeout: number;
  // Email
  emailProvider: 'SMTP' | 'SES' | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  smtpPasswordConfigured: boolean;
  sesRegion: string | null;
  sesAccessKeyId: string | null;
  sesFrom: string | null;
  sesSecretAccessKeyConfigured: boolean;
}

export interface SecurityPolicyPayload {
  maxLoginAttempts: number;
  accountLockDurationHours: number;
  passwordHistoryLimit: number;
  sessionInactivityTimeout: number;
}

export interface EmailConfigPayload {
  emailProvider: 'SMTP' | 'SES' | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFrom?: string | null;
  sesRegion?: string | null;
  sesAccessKeyId?: string | null;
  sesSecretAccessKey?: string | null;
  sesFrom?: string | null;
}

/**
 * OrgPolicyService — wraps the three /api/v1/org-policy endpoints
 * (GET, PUT /security, PUT /email). Mirrors the announcement /
 * branding service shape: signal-backed state, in-page feedback via
 * skipLoader, reads pipe through _cancelReads$ for ngOnDestroy abort.
 */
@Injectable({ providedIn: 'root' })
export class OrgPolicyService {
  private readonly http = inject(HttpClientService);

  private _current = signal<OrgPolicyPayload | null>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  private _cancelReads$ = new Subject<void>();

  async getPolicy(): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ORG_POLICY.GET, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async updateSecurity(payload: SecurityPolicyPayload): Promise<any> {
    this._saving.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPut(ORG_POLICY.UPDATE_SECURITY, payload, {
          skipLoader: true,
        }),
      );
      if (res?.status && res?.data) {
        // Merge so the policy snapshot stays consistent — the BE only
        // returns the slice it updated.
        const cur = this._current();
        this._current.set({ ...(cur as any), ...res.data });
      }
      return res;
    } finally {
      this._saving.set(false);
    }
  }

  async updateEmail(payload: EmailConfigPayload): Promise<any> {
    this._saving.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPut(ORG_POLICY.UPDATE_EMAIL, payload, {
          skipLoader: true,
        }),
      );
      if (res?.status && res?.data) {
        const cur = this._current();
        this._current.set({ ...(cur as any), ...res.data });
      }
      return res;
    } finally {
      this._saving.set(false);
    }
  }

  cancelReads(): void {
    this._cancelReads$.next();
  }
}
