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

type RoleSortField = 'name' | 'memberCount';

/**
 * ListDbRolesComponent — the Database Roles section landing. Same list-user
 * shell as Users (h2 above a flat card, datasource-picker toolbar, modern
 * table, sortable headers, filter row, row-actions, paginator refresh) but
 * for group roles (canLogin === false). Row actions include a membership
 * attach + the owned-object delete wizard. NO p-tabView.
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
  private allRoles: any[] = [];
  roles: any[] = [];

  sortHelper = new ListSortHelper<RoleSortField>();
  filterName = '';
  private filter$ = new Subject<void>();

  // Membership dialog.
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
    this.filterName = '';
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
        this.allRoles = all.filter(r => !(r.canLogin || r.attributes?.login));
        this.applyFilters();
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  get isFilterActive(): boolean {
    return !!this.filterName;
  }

  onFilterChange(): void {
    this.filter$.next();
  }

  clearFilters(): void {
    this.filterName = '';
    this.applyFilters();
  }

  toggleSort(field: RoleSortField): void {
    this.sortHelper.toggle(field);
    this.applyFilters();
  }

  private applyFilters(): void {
    const name = this.filterName.trim().toLowerCase();
    let rows = name
      ? this.allRoles.filter(r => String(r.name).toLowerCase().includes(name))
      : [...this.allRoles];
    rows = this.sortRows(rows);
    this.roles = rows;
    this.cdr.markForCheck();
  }

  private sortRows(rows: any[]): any[] {
    const nameDir = this.sortHelper.direction('name');
    const countDir = this.sortHelper.direction('memberCount');
    const active = nameDir
      ? { field: 'name' as RoleSortField, dir: nameDir }
      : countDir
        ? { field: 'memberCount' as RoleSortField, dir: countDir }
        : null;
    if (!active) return rows;
    const factor = active.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = active.field === 'name' ? String(a.name).toLowerCase() : this.memberCount(a);
      const bv = active.field === 'name' ? String(b.name).toLowerCase() : this.memberCount(b);
      if (av < bv) return -1 * factor;
      if (av > bv) return 1 * factor;
      return 0;
    });
  }

  get allRoleOptions(): { label: string; value: string }[] {
    return (this.dbAccess.roles() ?? []).map(r => ({ label: r.name, value: r.name }));
  }

  memberCount(role: any): number {
    return role.memberCount ?? role.members?.length ?? 0;
  }

  // ── Navigation (carry ?ds=) ──────────────────────────────────────────
  onAdd(): void {
    this.router.navigate([DB_ACCESS.roleNew()], { queryParams: { ds: this.datasourceId } });
  }
  onView(role: any): void {
    this.router.navigate([DB_ACCESS.roleView(role.name)], { queryParams: { ds: this.datasourceId } });
  }
  onEdit(role: any): void {
    this.router.navigate([DB_ACCESS.roleEdit(role.name)], { queryParams: { ds: this.datasourceId } });
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

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_DELETE_ROLE');
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
