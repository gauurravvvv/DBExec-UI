import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
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

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;
  capability = this.ctx.capability;
  capabilityLoading = this.ctx.capabilityLoading;
  unsupported = this.ctx.unsupported;

  datasourceId = '';
  // Current server page of roles (login + group) shown in the grid.
  roles: any[] = [];

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */
  cols: CustomTableColumn[] = [];
  tableConfig: CustomTableConfig = {
    mode: 'scroll', // plain infinite scroll — no page controls
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true, // search box matches role name
    globalSearchKey: 'name', // roles BE matches the `name` filter key
    // Field-specific placeholder set in ngOnInit (translate ready there) so
    // the user knows exactly what the search matches.
    globalSearchPlaceholder: undefined,
    showColumnFilters: true, // Filter toggle reveals per-column filters
    enableExport: true,
    gridKey: 'db-roles-list',
    height: 'flex', // fill available height, responsive to screen size
    rowIdField: 'name',
  };
  /** Table baseFilter — the Type segmented control (All/Login/Group). The
   *  table merges this with its own search + column filters (single writer). */
  tableBaseFilter: Record<string, unknown> = {};
  // Server-side adapter: the grid's page/sort + toolbar Type/name/status drive
  // a BE query (LIMIT/OFFSET + WHERE + COUNT). See buildAdapter().
  adapter: UsServerListAdapter<any> | null = null;

  // Type filter defaults to "all" — the merged screen shows everything on
  // open, with the Type column distinguishing login users from group roles.
  typeFilter: RoleTypeFilter = 'all';

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
    this.deleteModeOptions = [
      { label: this.translate.instant('DB_ACCESS.REASSIGN_TO'), value: 'reassign' },
      { label: this.translate.instant('DB_ACCESS.DROP_OWNED'), value: 'drop' },
    ];
    this.cols = this.buildColumns();
    // Field-specific search placeholder so the user knows what the box matches.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant('DB_ACCESS.SEARCH_ROLES_PLACEHOLDER'),
    };
    this.buildAdapter();
  }

  ngOnDestroy(): void {
    this.dbAccess.cancelReads();
    this.adapter?.destroy();
  }

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; sort colIds map to BE keys via the adapter's sortFieldMap.
   *  `field` on sortable columns is the BE sort field the header emits. */
  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text' },
      { colId: 'type', field: 'type', header: t('DB_ACCESS.TYPE'), width: '130px' },
      { colId: 'status', field: 'status', header: t('COMMON.STATUS'), width: '130px', sortable: false },
      { colId: 'validUntil', field: 'validUntil', header: t('DB_ACCESS.EXPIRY'), width: '150px', sortable: false },
      { colId: 'connectionLimit', field: 'connectionLimit', header: t('DB_ACCESS.CONN_LIMIT'), width: '150px', sortable: false },
      { colId: 'flags', field: 'flags', header: t('DB_ACCESS.FLAGS'), width: '190px', sortable: false },
      { colId: 'memberOf', field: 'memberOf', header: t('DB_ACCESS.MEMBER_OF'), width: '190px', sortable: false },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '190px', sortable: false },
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
      // Scroll page size — matches tableConfig.pageSize so the first fetch and
      // each subsequent scroll page pull the same count.
      initial: { page: 1, limit: 50 },
    });
  }

  /** The Type segmented control as the table's base filter slice ({ type? }).
   *  The table merges this with its own name search + Status column filter. */
  private buildBaseFilter(): Record<string, unknown> {
    if (this.typeFilter === 'login') return { type: 'login' };
    if (this.typeFilter === 'group') return { type: 'group' };
    return {};
  }

  onDatasourceChange(id: string): void {
    this.datasourceId = id || '';
    this.roles = [];
    this.typeFilter = 'all';
    this.tableBaseFilter = {};
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

  // ── Type filter (feeds the table's baseFilter; table owns setFilter) ──────
  setTypeFilter(type: RoleTypeFilter): void {
    if (this.typeFilter === type) return;
    this.typeFilter = type;
    // New object reference so the table's ngOnChanges(baseFilter) fires.
    this.tableBaseFilter = this.buildBaseFilter();
  }

  isLogin(role: any): boolean {
    return !!(role.canLogin || role.attributes?.login);
  }

  get isFilterActive(): boolean {
    return this.typeFilter !== 'all';
  }

  clearFilters(): void {
    this.typeFilter = 'all';
    this.tableBaseFilter = {};
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
