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

type RoleSortField =
  | 'name'
  | 'type'
  | 'status'
  | 'validUntil'
  | 'connectionLimit'
  | 'memberCount';

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
 * chosen via the shared picker (writes ?ds= + context); roles are fetched
 * once (BE returns all) and paged client-side.
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
  // All roles for the datasource (login + group), fetched once.
  private allRoles: any[] = [];
  roles: any[] = [];

  sortHelper = new ListSortHelper<RoleSortField>();
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
    this.filter$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilters());
  }

  ngOnDestroy(): void {
    this.dbAccess.cancelReads();
  }

  onDatasourceChange(id: string): void {
    this.datasourceId = id || '';
    this.allRoles = [];
    this.roles = [];
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
        // Keep ALL roles — the Type filter does the login/group slicing.
        this.allRoles = this.dbAccess.roles() ?? [];
        this.applyFilters();
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  // ── Type filter ─────────────────────────────────────────────────────────
  setTypeFilter(type: RoleTypeFilter): void {
    if (this.typeFilter === type) return;
    this.typeFilter = type;
    this.applyFilters();
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
    this.filter$.next();
  }

  clearFilters(): void {
    this.filterValues = { name: '', status: null };
    this.typeFilter = 'all';
    this.applyFilters();
  }

  toggleSort(field: RoleSortField): void {
    this.sortHelper.toggle(field);
    this.applyFilters();
  }

  private applyFilters(): void {
    const name = (this.filterValues.name || '').trim().toLowerCase();
    const status = this.filterValues.status;
    let rows = this.allRoles.filter(r => {
      // Type slice.
      if (this.typeFilter === 'login' && !this.isLogin(r)) return false;
      if (this.typeFilter === 'group' && this.isLogin(r)) return false;
      // Name + status.
      if (name && !String(r.name).toLowerCase().includes(name)) return false;
      if (status && this.statusOf(r) !== status) return false;
      return true;
    });
    rows = this.sortRows(rows);
    this.roles = rows;
    this.cdr.markForCheck();
  }

  private sortRows(rows: any[]): any[] {
    const fields: RoleSortField[] = [
      'name',
      'type',
      'status',
      'validUntil',
      'connectionLimit',
      'memberCount',
    ];
    const active = fields
      .map(f => ({ field: f, dir: this.sortHelper.direction(f) }))
      .find(x => !!x.dir);
    if (!active || !active.dir) return rows;
    const factor = active.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = this.sortValue(a, active.field);
      const bv = this.sortValue(b, active.field);
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return 0;
    });
  }

  private sortValue(role: any, field: RoleSortField): any {
    const a = role.attributes ?? role;
    switch (field) {
      case 'name': return String(role.name).toLowerCase();
      case 'type': return this.isLogin(role) ? 0 : 1;
      case 'status': return this.statusOf(role);
      case 'validUntil': return new Date(a.validUntil ?? role.validUntil ?? 0).getTime();
      case 'connectionLimit': return a.connectionLimit ?? role.connectionLimit ?? -1;
      case 'memberCount': return this.memberCount(role);
      default: return '';
    }
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
    // Preselect the create form's "Can log in" toggle from the active Type
    // filter: group → OFF, otherwise ON (login is the common default).
    const login = this.typeFilter === 'group' ? '0' : '1';
    this.router.navigate([DB_ACCESS.roleNew()], {
      queryParams: { ds: this.datasourceId, login },
    });
  }
  onView(role: any): void {
    this.router.navigate([DB_ACCESS.roleView(role.name)], { queryParams: { ds: this.datasourceId } });
  }
  onEdit(role: any): void {
    this.router.navigate([DB_ACCESS.roleEdit(role.name)], { queryParams: { ds: this.datasourceId } });
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
