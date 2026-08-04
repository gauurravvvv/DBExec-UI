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
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import {
  AssetShareGrantInput,
  AssetShareService,
} from 'src/app/shared/services/asset-shares.service';

/** The asset family this dialog is sharing. */
export type ShareableAssetType =
  | 'dataset'
  | 'analysis'
  | 'dashboard'
  | 'querybuilder';

/**
 * AssetShareDialog — a Google-Docs-style share modal for datasets, analyses,
 * dashboards and query builders. Reused across all modules (declared in
 * SharedModule).
 *
 * Sharing is VIEW-ONLY: a grant confers read + run access and nothing more.
 * Edit/delete authority stays with the asset's creator or an org admin and is
 * never conferred by a share — so there is no level picker. Adding a
 * user/group simply grants view.
 *
 * Renders as a `.confirmation-popup` overlay (NOT a p-dialog), matching the
 * app dialog convention. Surfaces:
 *   - a recipient picker (users + groups); "Add" grants them view in one bulk
 *     call;
 *   - the current-access list: the owner pinned first, then each grant with a
 *     static "View" badge and a Revoke button (inline two-click confirm).
 *
 * All I/O goes through AssetShareService (signals). The parent toggles
 * [visible] and listens to (closed).
 */
@Component({
  selector: 'app-asset-share-dialog',
  templateUrl: './asset-share-dialog.component.html',
  styleUrls: ['./asset-share-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetShareDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() assetType: ShareableAssetType = 'dataset';
  @Input() assetId = '';
  @Input() assetName = '';
  @Output() closed = new EventEmitter<void>();

  // Add-recipients form state. Sharing is view-only, so there is no level
  // to choose — every grant is 'view'.
  selectedUserIds: string[] = [];
  selectedGroupIds: string[] = [];
  adding = false;

  // Inline revoke confirmation: the grant id awaiting a confirming 2nd click.
  private _revokeArmed: string | null = null;

  constructor(
    public shareService: AssetShareService,
    private _users: UserService,
    private _groups: GroupService,
    private _message: MessageService,
    private _translate: TranslateService,
    private _cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.assetId) {
      this.selectedUserIds = [];
      this.selectedGroupIds = [];
      this._revokeArmed = null;
      this.shareService.reset();
      void this.refresh();
    }
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this._translate.instant(key, params);
  }

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

  async refresh(): Promise<void> {
    await this.shareService.loadShares(this.assetType, this.assetId);
    this._cdr.markForCheck();
  }

  // ── Recipient pickers (server fetchers) ──────────────────────────────

  loadUsersPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ username: search });
    try {
      const res: any = await this._users.listUser(params);
      if (res?.status) {
        const users = (res?.data?.users || []).filter(
          (u: any) => u.status === 1,
        );
        return { items: users, total: res?.data?.count ?? users.length };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  resolveSelectedUser = async (id: string): Promise<any> => {
    try {
      const res: any = await this._users.viewOrgUser(id);
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  loadGroupsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this._groups.listGroups(params);
      if (res?.status) {
        const groups = res?.data?.groups || res?.data || [];
        return { items: groups, total: res?.data?.count ?? groups.length };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  resolveSelectedGroup = async (id: string): Promise<any> => {
    try {
      const res: any = await this._groups.viewGroup(id);
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  get canAdd(): boolean {
    return (
      !this.adding &&
      (this.selectedUserIds.length > 0 || this.selectedGroupIds.length > 0)
    );
  }

  async add(): Promise<void> {
    if (!this.canAdd) return;
    // Sharing is view-only — every grant is 'view'.
    const grants: AssetShareGrantInput[] = [
      ...this.selectedUserIds.map(id => ({
        granteeType: 'user' as const,
        granteeId: id,
        permission: 'view' as const,
      })),
      ...this.selectedGroupIds.map(id => ({
        granteeType: 'group' as const,
        granteeId: id,
        permission: 'view' as const,
      })),
    ];
    this.adding = true;
    this._cdr.markForCheck();
    try {
      const res: any = await this.shareService.addShares(
        this.assetType,
        this.assetId,
        grants,
      );
      if (res?.status) {
        this.toastSuccess(this.t('SHARE.GRANTED'));
        this.selectedUserIds = [];
        this.selectedGroupIds = [];
        await this.refresh();
      } else {
        this.toastError(res?.message || this.t('SHARE.GRANT_FAILED'));
      }
    } catch {
      this.toastError(this.t('SHARE.GRANT_FAILED'));
    } finally {
      this.adding = false;
      this._cdr.markForCheck();
    }
  }

  // ── Per-grant revoke ─────────────────────────────────────────────────
  // Sharing is view-only, so there is no per-grant level to change — the
  // only per-grant action is revoke.

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
    this._revokeArmed = null;
    this._cdr.markForCheck();
    try {
      const res: any = await this.shareService.revokeShare(id);
      if (res?.status) {
        this.toastSuccess(this.t('SHARE.REVOKED'));
        await this.refresh();
      } else {
        this.toastError(res?.message || this.t('SHARE.REVOKE_FAILED'));
      }
    } catch {
      this.toastError(this.t('SHARE.REVOKE_FAILED'));
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  close(): void {
    this._revokeArmed = null;
    this.shareService.cancelReads();
    this.closed.emit();
  }
}
