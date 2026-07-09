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
import type { ColDef } from 'ag-grid-community';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/** Login-type filter for the merged list. */
type RoleTypeFilter = 'all' | 'login' | 'group';

/**
 * ListDbRolesComponent — the single "Database Users & Roles" landing.
 *
 * A PostgreSQL "user" and "role" are the same pg_roles object; they differ
 * only by canLogin (LOGIN vs NOLOGIN). This one screen manages both. A Type
 * filter (All / Login users / Group roles) slices the list; login-only
 * columns (status, expiry, conn-limit, flags) render for every row but read
 * "—" for group roles. Row actions cover the login-user lifecycle
 * (deactivate) AND the group-role lifecycle (membership attach/detach), plus
 * the shared owned-object delete wizard. NO p-tabView.
 *
 * Same list-user shell as the rest of the app: h2 above a flat card, a
 * datasource-picker toolbar, a modern table with sortable headers, filter
 * row, status pills, row-actions and a paginator refresh. The datasource is
 * chosen via the shared picker (writes ?ds= + context); roles are paged
 * server-side (BE listRolesPaged: LIMIT/OFFSET + WHERE + COUNT).
 */
@Component({
  selector: 'app-list-db-roles',
  templateUrl: './list-db-roles.component.html',
  styleUrls: ['./list-db-roles.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDbRolesComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;
  capability = this.ctx.capability;
  capabilityLoading = this.ctx.capabilityLoading;
  unsupported = this.ctx.unsupported;

  datasourceId = '';
  // Current server page of roles (login + group) shown in the grid.
  roles: any[] = [];

  /* ── us-data-grid wiring (identical pattern to list-user) ───────────── */
  cols: ColDef[] = [];
  gridConfig: UsDataGridConfig = {
    enableRowSelection: false,
    freezeFirstColumn: true,
    enableColumnChooser: true,
    enableAddFilter: false,
    enableAutoFit: true,
    enableDensityToggle: true,
    enableCsvExport: true,
    enableXlsxExport: true,
    enableRefresh: true,
    enableSavedViews: true,
    gridKey: 'db-roles-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 280px)',
    rowIdField: 'name',
  };
  // Server-side adapter: the grid's page/sort + toolbar Type/name/status drive
  // a BE query (LIMIT/OFFSET + WHERE + COUNT). See buildAdapter().
  adapter: UsServerListAdapter<any> | null = null;

  // Type filter defaults to "all" — the merged screen shows everything on
  // open, with the Type column distinguishing login users from group roles.
  typeFilter: RoleTypeFilter = 'all';
  statusOptions: { label: string; value: string }[] = [];
  filterValues: { name: string; status: string | null } = { name: '', status: null };
  private filter$ = new Subject<void>();

  // Membership dialog (group-role lifecycle).
  showMembership = false;
  membershipMode: 'attach' | 'detach' = 'attach';
  membershipRoles: string[] = [];
  membershipTarget = '';
  membershipAdminOption = false;

  // Change-summary confirm gate.
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
  deleteModeOptions: { label: string; value: 'reassign' | 'drop' }[] = [];

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
    this.deleteModeOptions = [
      { label: this.translate.instant('DB_ACCESS.REASSIGN_TO'), value: 'reassign' },
      { label: this.translate.instant('DB_ACCESS.DROP_OWNED'), value: 'drop' },
    ];
    this.cols = this.buildColumns();
    this.buildAdapter();
    this.filter$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());
  }

  ngOnDestroy(): void {
    this.dbAccess.cancelReads();
    this.adapter?.destroy();
  }

  /** AG Grid columns — widths preserved from the previous p-table. Cell DOM
   *  is supplied by `<ng-template usGridCell>` in the HTML. Sorting/filtering
   *  is handled client-side by the grid over the one BE page we feed it. */
  private buildColumns(): ColDef[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', headerName: t('COMMON.NAME'), minWidth: 224, flex: 1, filter: 'agTextColumnFilter', filterParams: { buttons: ['reset'], suppressAndOrCondition: true }, pinned: 'left' },
      { colId: 'type', field: 'canLogin', headerName: t('DB_ACCESS.TYPE'), width: 130, minWidth: 130 },
      { colId: 'status', field: 'status', headerName: t('COMMON.STATUS'), width: 130, minWidth: 130 },
      { colId: 'validUntil', field: 'validUntil', headerName: t('DB_ACCESS.EXPIRY'), width: 150, minWidth: 150 },
      { colId: 'connectionLimit', field: 'connectionLimit', headerName: t('DB_ACCESS.CONN_LIMIT'), width: 130, minWidth: 130 },
      { colId: 'flags', field: 'flags', headerName: t('DB_ACCESS.FLAGS'), minWidth: 190, sortable: false, filter: false },
      { colId: 'memberOf', field: 'memberOf', headerName: t('DB_ACCESS.MEMBER_OF'), minWidth: 190, sortable: false, filter: false },
      { colId: 'actions', headerName: t('COMMON.ACTIONS'), width: 190, minWidth: 190, sortable: false, filter: false, resizable: false, pinned: 'right' },
    ];
  }

  /**
   * Server-side adapter. Each `load` sends page/limit (+ sort + a JSON filter
   * carrying the name box, the Type segmented control, and status) to
   * loadRolesPaged → BE listRolesPaged (LIMIT/OFFSET + WHERE + COUNT). The
   * grid drives page + column sort; the toolbar Type/name/status feed the same
   * filter via patchFilter. `sortFieldMap` whitelists AG Grid colIds → BE sort
   * keys. No datasource ⇒ empty.
   */
  private buildAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: p => {
        if (!this.datasourceId) return Promise.resolve({ rows: [], total: 0 });
        return this.dbAccess
          .loadRolesPaged(this.datasourceId, {
            page: p.page,
            limit: p.limit,
            sort: p.sort,
            filter: p.filter, // JSON already merged by the adapter (patchFilter)
          })
          .then(res => {
            const rows = res?.status ? (res.data?.roles ?? []) : [];
            this.roles = rows;
            return { rows, total: res?.data?.count ?? rows.length };
          });
      },
      unwrap: (res: any) => ({ rows: res.rows, total: res.total }),
      // AG Grid colId → BE sort key (pg_roles column alias, whitelisted server-
      // side in listRolesPaged / ROLE_SORT). The toolbar Type/name/status feed
      // the filter via patchFilter(serverFilter()), so no per-column
      // filterBuilders here.
      sortFieldMap: {
        name: 'name',
        type: 'canLogin',
        status: 'status',
      },
      initial: { page: 1, limit: 10 },
    });
  }

  /**
   * The single JSON filter the BE understands ({ name?, type?, status? }),
   * assembled from the toolbar Type segmented control + name box + status.
   */
  private serverFilter(): Record<string, unknown> {
    const f: Record<string, unknown> = {};
    const name = (this.filterValues.name || '').trim();
    if (name) f['name'] = name;
    if (this.typeFilter === 'login') f['type'] = 'login';
    else if (this.typeFilter === 'group') f['type'] = 'group';
    if (this.filterValues.status) f['status'] = this.filterValues.status;
    return f;
  }

  onDatasourceChange(id: string): void {
    this.datasourceId = id || '';
    this.roles = [];
    this.filterValues = { name: '', status: null };
    this.typeFilter = 'all';
    if (!this.datasourceId) {
      this.adapter?.reload();
      this.cdr.markForCheck();
      return;
    }
    this.load();
  }

  load(): void {
    if (!this.datasourceId) return;
    // Server-paged: the adapter fetches page 1 with the current filter.
    this.adapter?.reload();
  }

  // ── Type filter ─────────────────────────────────────────────────────────
  setTypeFilter(type: RoleTypeFilter): void {
    if (this.typeFilter === type) return;
    this.typeFilter = type;
    // Re-query page 1 on the server with the new Type slice.
    this.adapter?.setFilter(this.serverFilter());
  }

  isLogin(role: any): boolean {
    return !!(role.canLogin || role.attributes?.login);
  }

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      this.filterValues.status !== null ||
      this.typeFilter !== 'all'
    );
  }

  onFilterChange(): void {
    // Debounced → server re-query page 1 with the merged filter.
    this.filter$.next();
  }

  clearFilters(): void {
    this.filterValues = { name: '', status: null };
    this.typeFilter = 'all';
    this.adapter?.setFilter(this.serverFilter());
  }

  private applyFilters(): void {
    // Server-paged now: push the merged toolbar filter to the BE (page 1).
    this.adapter?.setFilter(this.serverFilter());
    this.cdr.markForCheck();
  }

  /** Grid Refresh button → re-fetch roles from the datasource. */
  refreshList(): void {
    this.load();
  }

  // ── Row rendering helpers (login-aware) ─────────────────────────────────
  flagsOf(role: any): string[] {
    const a = role.attributes ?? role;
    const flags: string[] = [];
    if (a.superuser) flags.push('SUPERUSER');
    if (a.createdb) flags.push('CREATEDB');
    if (a.createrole) flags.push('CREATEROLE');
    if (a.replication) flags.push('REPLICATION');
    if (a.bypassrls) flags.push('BYPASSRLS');
    return flags;
  }

  statusOf(role: any): 'active' | 'no-login' | 'expired' {
    const a = role.attributes ?? role;
    if (!this.isLogin(role)) return 'no-login';
    const validUntil = a.validUntil ?? role.validUntil;
    if (validUntil && new Date(validUntil).getTime() < Date.now()) return 'expired';
    return 'active';
  }

  connLimitOf(role: any): string {
    const a = role.attributes ?? role;
    const cl = a.connectionLimit ?? role.connectionLimit;
    if (cl === -1 || cl == null) return this.translate.instant('DB_ACCESS.UNLIMITED');
    return String(cl);
  }

  memberCount(role: any): number {
    return role.memberCount ?? role.members?.length ?? 0;
  }

  /** All roles for grantee pickers (any target may receive membership). */
  get allRoleOptions(): { label: string; value: string }[] {
    return (this.dbAccess.roles() ?? []).map(r => ({ label: r.name, value: r.name }));
  }

  /** Group roles only — the valid reassign target when dropping a role. */
  get groupRoleOptions(): { label: string; value: string }[] {
    return (this.dbAccess.roles() ?? [])
      .filter(r => !this.isLogin(r))
      .map(r => ({ label: r.name, value: r.name }));
  }

  // ── Navigation (carry ?ds=) ──────────────────────────────────────────
  onAdd(): void {
    // Clean route — the Add-Role form now has the user pick the datasource
    // (and the login toggle) manually, so no ?ds= / ?login= query params.
    this.router.navigate([DB_ACCESS.roleNew()]);
  }
  onView(role: any): void {
    // Datasource is carried by the shared context (not the URL).
    this.router.navigate([DB_ACCESS.roleView(role.name)]);
  }
  onEdit(role: any): void {
    // Datasource is carried by the shared context (not the URL).
    this.router.navigate([DB_ACCESS.roleEdit(role.name)]);
  }

  // ── Deactivate (login users only) ───────────────────────────────────────
  deactivate(role: any): void {
    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_DEACTIVATE');
    this.previewDestructive = false;
    this.confirmPhrase = null;
    const body = { attributes: { login: false } };
    const intent: ChangeIntent = { kind: 'deactivate', name: role.name };
    this.runPreviewAndArm(
      [intent],
      () => this.dbAccess.updateRole(this.datasourceId, role.name, { ...body, previewOnly: true }),
      () => this.dbAccess.updateRole(this.datasourceId, role.name, body),
    );
  }

  // ── Membership ────────────────────────────────────────────────────────
  openMembership(mode: 'attach' | 'detach', role?: any): void {
    this.membershipMode = mode;
    this.membershipRoles = role ? [role.name] : [];
    this.membershipTarget = '';
    this.membershipAdminOption = false;
    this.showMembership = true;
  }

  submitMembership(): void {
    if (!this.membershipRoles.length || !this.membershipTarget) return;
    const roleArg =
      this.membershipRoles.length === 1 ? this.membershipRoles[0] : this.membershipRoles;
    this.confirmPhrase = null;

    if (this.membershipMode === 'attach') {
      const body: any = {
        role: roleArg,
        toRole: this.membershipTarget,
        adminOption: this.membershipAdminOption,
      };
      this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_GRANT_MEMBERSHIP');
      this.previewDestructive = false;
      this.showMembership = false;
      const intent: ChangeIntent = { kind: 'grantMembership', role: roleArg, toRole: this.membershipTarget };
      this.runPreviewAndArm(
        [intent],
        () => this.dbAccess.attachRole(this.datasourceId, { ...body, previewOnly: true }),
        () => this.dbAccess.attachRole(this.datasourceId, body),
      );
    } else {
      const body: any = { role: roleArg, toRole: this.membershipTarget, confirm: true };
      this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_REVOKE_MEMBERSHIP');
      this.previewDestructive = true;
      this.showMembership = false;
      const intent: ChangeIntent = { kind: 'revokeMembership', role: roleArg, toRole: this.membershipTarget };
      this.runPreviewAndArm(
        [intent],
        () => this.dbAccess.detachRole(this.datasourceId, { ...body, previewOnly: true }),
        () => this.dbAccess.detachRole(this.datasourceId, body),
      );
    }
  }

  cancelMembership(): void {
    this.showMembership = false;
  }

  // ── Delete wizard ─────────────────────────────────────────────────────
  openDelete(role: any): void {
    this.deleteTarget = role;
    this.deleteMode = 'reassign';
    this.reassignTo = '';
    this.ownedSummary = null;
    this.showDelete = true;
    this.ownedLoading = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadOwned(this.datasourceId, role.name)
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

    // Title reflects what the target actually is.
    this.previewTitle = this.translate.instant(
      this.isLogin(this.deleteTarget)
        ? 'DB_ACCESS.PREVIEW_DELETE_USER'
        : 'DB_ACCESS.PREVIEW_DELETE_ROLE',
    );
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
