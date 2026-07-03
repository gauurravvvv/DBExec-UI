import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
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
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

type UserSortField = 'name' | 'status' | 'validUntil' | 'connectionLimit';

/**
 * ListDbUsersComponent — the Database Users section landing. Mirrors
 * list-user: h2 in .page-header-section ABOVE a flat .content-card, a
 * card-toolbar row holding the shared datasource-picker + capability badge,
 * then a modern-table with sortable headers, a filter row, status pills,
 * .row-actions, an empty state and the paginator refresh button. NO
 * p-tabView. The datasource is chosen via the shared picker (writes ?ds= +
 * context); roles are fetched once (BE returns all) and paged client-side.
 */
@Component({
  selector: 'app-list-db-users',
  templateUrl: './list-db-users.component.html',
  styleUrls: ['./list-db-users.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDbUsersComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;
  capability = this.ctx.capability;
  capabilityLoading = this.ctx.capabilityLoading;
  unsupported = this.ctx.unsupported;

  datasourceId = '';
  private allUsers: any[] = [];
  users: any[] = [];

  sortHelper = new ListSortHelper<UserSortField>();
  statusOptions: { label: string; value: string }[] = [];
  filterValues: { name: string; status: string | null } = { name: '', status: null };
  private filter$ = new Subject<void>();

  // Change-summary confirm gate (plain-language, never SQL).
  showPreview = false;
  previewLoading = false;
  summaries: string[] = [];
  previewDestructive = false;
  previewTitle = '';
  confirmPhrase: string | null = null;
  private pendingExecute: (() => Promise<any>) | null = null;

  // Delete wizard.
  showDelete = false;
  deleteTarget: any = null;
  ownedLoading = false;
  ownedSummary: any = null;
  deleteMode: 'reassign' | 'drop' = 'reassign';
  reassignTo = '';

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private router: Router,
  ) {}

  get canManage(): boolean {
    return this.ctx.canManage;
  }

  ngOnInit(): void {
    this.statusOptions = [
      { label: this.translate.instant('DB_ACCESS.STATUS_ACTIVE'), value: 'active' },
      { label: this.translate.instant('DB_ACCESS.STATUS_NO-LOGIN'), value: 'no-login' },
      { label: this.translate.instant('DB_ACCESS.STATUS_EXPIRED'), value: 'expired' },
    ];
    this.filter$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());
  }

  ngOnDestroy(): void {
    this.dbAccess.cancelReads();
  }

  /** Emitted by the datasource picker (init hydrate + user change). */
  onDatasourceChange(id: string): void {
    this.datasourceId = id || '';
    this.allUsers = [];
    this.users = [];
    this.filterValues = { name: '', status: null };
    if (!this.datasourceId) {
      this.cdr.markForCheck();
      return;
    }
    this.load();
  }

  load(): void {
    if (!this.datasourceId) return;
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

  toggleSort(field: UserSortField): void {
    this.sortHelper.toggle(field);
    this.applyFilters();
  }

  private applyFilters(): void {
    const name = (this.filterValues.name || '').trim().toLowerCase();
    const status = this.filterValues.status;
    let rows = this.allUsers.filter(u => {
      if (name && !String(u.name).toLowerCase().includes(name)) return false;
      if (status && this.statusOf(u) !== status) return false;
      return true;
    });
    rows = this.sortRows(rows);
    this.users = rows;
    this.cdr.markForCheck();
  }

  private sortRows(rows: any[]): any[] {
    const dir = this.sortHelper.direction('name')
      ? { field: 'name' as UserSortField, dir: this.sortHelper.direction('name') }
      : this.sortHelper.direction('status')
        ? { field: 'status' as UserSortField, dir: this.sortHelper.direction('status') }
        : this.sortHelper.direction('validUntil')
          ? { field: 'validUntil' as UserSortField, dir: this.sortHelper.direction('validUntil') }
          : this.sortHelper.direction('connectionLimit')
            ? { field: 'connectionLimit' as UserSortField, dir: this.sortHelper.direction('connectionLimit') }
            : null;
    if (!dir) return rows;
    const factor = dir.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = this.sortValue(a, dir.field);
      const bv = this.sortValue(b, dir.field);
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return 0;
    });
  }

  private sortValue(u: any, field: UserSortField): any {
    const a = u.attributes ?? u;
    switch (field) {
      case 'name': return String(u.name).toLowerCase();
      case 'status': return this.statusOf(u);
      case 'validUntil': return new Date(a.validUntil ?? u.validUntil ?? 0).getTime();
      case 'connectionLimit': return a.connectionLimit ?? u.connectionLimit ?? -1;
      default: return '';
    }
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
    if (validUntil && new Date(validUntil).getTime() < Date.now()) return 'expired';
    return 'active';
  }

  connLimitOf(user: any): string {
    const a = user.attributes ?? user;
    const cl = a.connectionLimit ?? user.connectionLimit;
    if (cl === -1 || cl == null) return this.translate.instant('DB_ACCESS.UNLIMITED');
    return String(cl);
  }

  get groupRoleOptions(): { label: string; value: string }[] {
    return (this.dbAccess.roles() ?? [])
      .filter(r => !(r.canLogin || r.attributes?.login))
      .map(r => ({ label: r.name, value: r.name }));
  }

  // ── Navigation (carry ?ds=) ──────────────────────────────────────────
  onAdd(): void {
    this.router.navigate([DB_ACCESS.userNew()], { queryParams: { ds: this.datasourceId } });
  }
  onView(user: any): void {
    this.router.navigate([DB_ACCESS.userView(user.name)], { queryParams: { ds: this.datasourceId } });
  }
  onEdit(user: any): void {
    this.router.navigate([DB_ACCESS.userEdit(user.name)], { queryParams: { ds: this.datasourceId } });
  }

  // ── Deactivate ────────────────────────────────────────────────────────
  deactivate(user: any): void {
    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_DEACTIVATE');
    this.previewDestructive = false;
    this.confirmPhrase = null;
    const body = { attributes: { login: false } };
    const intent: ChangeIntent = { kind: 'deactivate', name: user.name };
    this.runPreviewAndArm(
      [intent],
      () => this.dbAccess.updateRole(this.datasourceId, user.name, { ...body, previewOnly: true }),
      () => this.dbAccess.updateRole(this.datasourceId, user.name, body),
    );
  }

  // ── Delete wizard ─────────────────────────────────────────────────────
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

  get ownedCount(): number {
    return this.ownedSummary?.count ?? this.ownedSummary?.objects?.length ?? 0;
  }

  proceedDelete(): void {
    if (!this.deleteTarget) return;
    const name = this.deleteTarget.name;
    const base: any = { confirm: true };
    if (this.deleteMode === 'reassign' && this.reassignTo) base.reassignTo = this.reassignTo;
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
      () => this.dbAccess.deleteRole(this.datasourceId, name, { ...base, previewOnly: true }),
      () => this.dbAccess.deleteRole(this.datasourceId, name, base),
    );
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
      .catch(() => (this.showPreview = false))
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
