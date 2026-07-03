import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/**
 * DbUsersComponent — LISTING for login roles (canLogin === true). A p-table
 * with status pill / expiry / connection limit / attribute chips / member-of,
 * a filter row (name + status, debounced), client-side pagination, and row
 * actions (view / edit / deactivate / delete). The BE returns all roles in
 * one call, so filtering + paging happen in-memory — the table only renders
 * the current page, so large role sets don't hang the UI. Add + edit + view
 * are full SCREENS. Destructive ops (deactivate / delete) use confirm popups.
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
  private destroyRef = inject(DestroyRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;

  private allUsers: any[] = []; // full set from BE
  users: any[] = []; // filtered view bound to the table

  // ── Filters (debounced, client-side) ──────────────────────────────────
  statusFilterOptions: { label: string; value: string }[] = [];
  filterValues: { name: string; status: string | null } = {
    name: '',
    status: null,
  };
  private filter$ = new Subject<void>();

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
    this.statusFilterOptions = [
      { label: this.translate.instant('DB_ACCESS.STATUS_ACTIVE'), value: 'active' },
      { label: this.translate.instant('DB_ACCESS.STATUS_NO-LOGIN'), value: 'no-login' },
      { label: this.translate.instant('DB_ACCESS.STATUS_EXPIRED'), value: 'expired' },
    ];
    this.filter$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());
    this.load();
  }

  load(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        this.allUsers = all.filter(r => r.canLogin || r.attributes?.login);
        this.applyFilters();
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  get isFilterActive(): boolean {
    return !!this.filterValues.name || this.filterValues.status !== null;
  }

  onFilterChange(): void {
    this.filter$.next();
  }

  clearFilters(): void {
    this.filterValues = { name: '', status: null };
    this.applyFilters();
  }

  private applyFilters(): void {
    const name = (this.filterValues.name || '').trim().toLowerCase();
    const status = this.filterValues.status;
    this.users = this.allUsers.filter(u => {
      if (name && !String(u.name).toLowerCase().includes(name)) return false;
      if (status && this.statusOf(u) !== status) return false;
      return true;
    });
    this.cdr.markForCheck();
  }

  get groupRoleNames(): string[] {
    return (this.dbAccess.roles() ?? [])
      .filter(r => !(r.canLogin || r.attributes?.login))
      .map(r => r.name);
  }

  /** {label,value} options so the reassign dropdown renders labels. */
  get groupRoleOptions(): { label: string; value: string }[] {
    return this.groupRoleNames.map(n => ({ label: n, value: n }));
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
