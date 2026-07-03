import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/**
 * DbUsersComponent — LISTING for login roles (canLogin === true). A p-table
 * with status pill / expiry / connection limit / attribute chips / member-of
 * and row actions (view / edit / deactivate / delete). Add + edit + view are
 * now full SCREENS (routes) — this component only lists and confirms
 * destructive ops (deactivate + a delete wizard) via the plain-language
 * confirm gate. NO SQL is ever surfaced.
 */
@Component({
  selector: 'app-db-users',
  templateUrl: './db-users.component.html',
  styleUrls: ['./db-users.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbUsersComponent implements OnInit {
  @Input() datasourceId = '';
  @Input() canManage = false;

  private cdr = inject(ChangeDetectorRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;

  users: any[] = [];

  // ── Change-summary confirm gate (plain-language, never SQL) ───────────
  showPreview = false;
  previewLoading = false;
  summaries: string[] = [];
  previewDestructive = false;
  previewTitle = '';
  confirmPhrase: string | null = null;
  private pendingExecute: (() => Promise<any>) | null = null;

  // ── Delete wizard ─────────────────────────────────────────────────────
  showDelete = false;
  deleteTarget: any = null;
  ownedLoading = false;
  ownedSummary: any = null;
  deleteMode: 'reassign' | 'drop' = 'reassign';
  reassignTo = '';

  constructor(
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        this.users = all.filter(r => r.canLogin || r.attributes?.login);
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  get groupRoleNames(): string[] {
    return (this.dbAccess.roles() ?? [])
      .filter(r => !(r.canLogin || r.attributes?.login))
      .map(r => r.name);
  }

  flagsOf(user: any): string[] {
    const a = user.attributes ?? user;
    const flags: string[] = [];
    if (a.superuser) flags.push('SUPERUSER');
    if (a.createdb) flags.push('CREATEDB');
    if (a.createrole) flags.push('CREATEROLE');
    if (a.replication) flags.push('REPLICATION');
    if (a.bypassrls) flags.push('BYPASSRLS');
    return flags;
  }

  statusOf(user: any): 'active' | 'no-login' | 'expired' {
    const a = user.attributes ?? user;
    if (!(user.canLogin || a.login)) return 'no-login';
    const validUntil = a.validUntil ?? user.validUntil;
    if (validUntil && new Date(validUntil).getTime() < Date.now())
      return 'expired';
    return 'active';
  }

  // ── Navigation to full screens ──────────────────────────────────────────

  onAdd(): void {
    this.router.navigate([DB_ACCESS.userNew(this.datasourceId)]);
  }

  onView(user: any): void {
    this.router.navigate([DB_ACCESS.userView(this.datasourceId, user.name)]);
  }

  onEdit(user: any): void {
    this.router.navigate([DB_ACCESS.userEdit(this.datasourceId, user.name)]);
  }

  // ── Deactivate ───────────────────────────────────────────────────────────

  deactivate(user: any): void {
    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_DEACTIVATE');
    this.previewDestructive = false;
    this.confirmPhrase = null;
    const body = { attributes: { login: false } };
    const intent: ChangeIntent = { kind: 'deactivate', name: user.name };
    this.runPreviewAndArm(
      [intent],
      () =>
        this.dbAccess.updateRole(this.datasourceId, user.name, {
          ...body,
          previewOnly: true,
        }),
      () => this.dbAccess.updateRole(this.datasourceId, user.name, body),
    );
  }

  // ── Delete wizard ──────────────────────────────────────────────────────

  openDelete(user: any): void {
    this.deleteTarget = user;
    this.deleteMode = 'reassign';
    this.reassignTo = '';
    this.ownedSummary = null;
    this.showDelete = true;
    this.ownedLoading = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadOwned(this.datasourceId, user.name)
      .then(res => {
        if (res?.status) this.ownedSummary = res.data;
      })
      .catch(() => {})
      .finally(() => {
        this.ownedLoading = false;
        this.cdr.markForCheck();
      });
  }

  cancelDelete(): void {
    this.showDelete = false;
    this.deleteTarget = null;
  }

  proceedDelete(): void {
    if (!this.deleteTarget) return;
    const name = this.deleteTarget.name;
    const base: any = { confirm: true };
    if (this.deleteMode === 'reassign' && this.reassignTo)
      base.reassignTo = this.reassignTo;
    if (this.deleteMode === 'drop') base.dropOwned = true;

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_DELETE_USER');
    this.previewDestructive = true;
    this.confirmPhrase = name;
    this.showDelete = false;
    const intent: ChangeIntent = {
      kind: 'deleteRole',
      name,
      reassignTo: this.deleteMode === 'reassign' ? this.reassignTo : undefined,
      dropOwned: this.deleteMode === 'drop',
    };
    this.runPreviewAndArm(
      [intent],
      () =>
        this.dbAccess.deleteRole(this.datasourceId, name, {
          ...base,
          previewOnly: true,
        }),
      () => this.dbAccess.deleteRole(this.datasourceId, name, base),
    );
  }

  get ownedCount(): number {
    return this.ownedSummary?.count ?? this.ownedSummary?.objects?.length ?? 0;
  }

  // ── Shared confirm flow ─────────────────────────────────────────────────

  private runPreviewAndArm(
    intents: ChangeIntent[],
    preview: () => Promise<any>,
    execute: () => Promise<any>,
  ): void {
    this.showPreview = true;
    this.previewLoading = true;
    this.summaries = intents.map(i => describeChange(i, this.translate));
    this.pendingExecute = execute;
    this.cdr.markForCheck();

    preview()
      .then(res => {
        if (!res?.status) {
          this.globalService.handleSuccessService(res);
          this.showPreview = false;
        }
      })
      .catch(() => {
        this.showPreview = false;
      })
      .finally(() => {
        this.previewLoading = false;
        this.cdr.markForCheck();
      });
  }

  confirmPreview(): void {
    if (!this.pendingExecute) return;
    this.pendingExecute()
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showPreview = false;
          this.load();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  cancelPreview(): void {
    this.showPreview = false;
    this.pendingExecute = null;
  }
}
