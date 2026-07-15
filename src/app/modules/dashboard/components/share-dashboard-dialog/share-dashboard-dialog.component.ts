import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { DashboardService } from 'src/app/modules/dashboard/services/dashboard.service';

/** A share link row as returned by the BE list endpoint. */
interface ShareToken {
  id: string;
  label?: string | null;
  urlPreview?: string; // masked/partial — the raw token is never re-returned
  expiresAt?: string | null;
  enabled?: boolean;
  revokedAt?: string | null;
  createdOn?: string;
  createdBy?: string;
}

/**
 * ShareDashboardDialog — mint / list / revoke public embed links for a
 * dashboard.
 *
 * The security model lives on the BE (hashed tokens, RLS-hardened public
 * render). This dialog is purely the management surface:
 *   - "Create link" mints a token; the RAW url is shown ONCE in a
 *     copy-to-clipboard banner (the server never returns it again), with
 *     an explicit warning to copy it now.
 *   - Existing links list with their label + expiry + status; each can be
 *     revoked (inline confirm, mirroring the destructive-action pattern
 *     used elsewhere — a second click to confirm rather than a nested
 *     dialog).
 *   - Anonymous-access reality is called out in the header hint so the
 *     user understands anyone with the link can view the snapshot.
 */
@Component({
  selector: 'app-share-dashboard-dialog',
  templateUrl: './share-dashboard-dialog.component.html',
  styleUrls: ['./share-dashboard-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareDashboardDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() dashboardId = '';
  @Input() dashboardName = '';
  @Output() closed = new EventEmitter<void>();

  tokens: ShareToken[] = [];
  loading = false;
  creating = false;

  // Create form
  label = '';
  expiresAt: Date | null = null;
  minExpiry = new Date();

  // The just-minted raw link — shown once, then cleared on dialog close.
  freshUrl: string | null = null;

  // Inline revoke confirmation: the id awaiting a confirming second click.
  revokingId: string | null = null;
  private _revokeArmed: string | null = null;

  constructor(
    private _dashboardService: DashboardService,
    private _message: MessageService,
    private _translate: TranslateService,
    private _cdr: ChangeDetectorRef,
  ) {}

  private toastSuccess(detail: string): void {
    this._message.add({
      severity: 'success',
      summary: this.t('TOAST.SUCCESS'),
      detail,
      styleClass: 'custom-toast',
      contentStyleClass: 'custom-toast-content',
    });
  }

  private toastError(detail: string): void {
    this._message.add({
      severity: 'error',
      summary: this.t('TOAST.ERROR'),
      detail,
      styleClass: 'custom-toast',
      contentStyleClass: 'custom-toast-content',
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.dashboardId) {
      this.freshUrl = null;
      this._revokeArmed = null;
      this.label = '';
      this.expiresAt = null;
      void this.loadTokens();
    }
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this._translate.instant(key, params);
  }

  async loadTokens(): Promise<void> {
    this.loading = true;
    this._cdr.markForCheck();
    try {
      this.tokens = await this._dashboardService.listShareTokens(
        this.dashboardId,
      );
    } catch {
      this.tokens = [];
    } finally {
      this.loading = false;
      this._cdr.markForCheck();
    }
  }

  async createLink(): Promise<void> {
    if (this.creating) return;
    this.creating = true;
    this._cdr.markForCheck();
    try {
      const res: any = await this._dashboardService.createShareToken(
        this.dashboardId,
        {
          label: this.label?.trim() || undefined,
          expiresAt: this.expiresAt ? this.expiresAt.toISOString() : null,
        },
      );
      // The raw url is returned exactly once.
      this.freshUrl = res?.data?.url ?? null;
      this.label = '';
      this.expiresAt = null;
      this.toastSuccess(this.t('DASHBOARD.SHARE.CREATED'));
      await this.loadTokens();
    } catch {
      this.toastError(this.t('DASHBOARD.SHARE.CREATE_FAILED'));
    } finally {
      this.creating = false;
      this._cdr.markForCheck();
    }
  }

  /** First click arms the confirm; second click within the same row revokes. */
  askRevoke(id: string): void {
    this._revokeArmed = id;
    this._cdr.markForCheck();
  }

  isRevokeArmed(id: string): boolean {
    return this._revokeArmed === id;
  }

  cancelRevoke(): void {
    this._revokeArmed = null;
    this._cdr.markForCheck();
  }

  async confirmRevoke(id: string): Promise<void> {
    this.revokingId = id;
    this._revokeArmed = null;
    this._cdr.markForCheck();
    try {
      await this._dashboardService.revokeShareToken(this.dashboardId, id);
      this.toastSuccess(this.t('DASHBOARD.SHARE.REVOKED'));
      await this.loadTokens();
    } catch {
      this.toastError(this.t('DASHBOARD.SHARE.REVOKE_FAILED'));
    } finally {
      this.revokingId = null;
      this._cdr.markForCheck();
    }
  }

  copy(text: string | null): void {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => this.toastSuccess(this.t('DASHBOARD.SHARE.COPIED')),
      () => this.toastError(this.t('DASHBOARD.SHARE.COPY_FAILED')),
    );
  }

  isExpired(tok: ShareToken): boolean {
    return (
      !!tok.expiresAt && new Date(tok.expiresAt).getTime() <= Date.now()
    );
  }

  isActive(tok: ShareToken): boolean {
    return !!tok.enabled && !tok.revokedAt && !this.isExpired(tok);
  }

  close(): void {
    this.freshUrl = null;
    this._revokeArmed = null;
    this.closed.emit();
  }
}
