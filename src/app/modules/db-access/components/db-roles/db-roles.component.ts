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
 * DbRolesComponent — LISTING for group roles (canLogin === false). A
 * p-table with member count + member-of and row actions (view / edit /
 * attach / delete). Create + edit + view are now full SCREENS (routes).
 * A membership dialog attaches / detaches role↔role and the delete wizard
 * handles owned-object reassign / drop — both destructive confirm popups
 * that flow through the plain-language confirm gate (never SQL).
 */
@Component({
  selector: 'app-db-roles',
  templateUrl: './db-roles.component.html',
  styleUrls: ['./db-roles.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbRolesComponent implements OnInit {
  @Input() datasourceId = '';
  @Input() canManage = false;

  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;

  private allRoles: any[] = []; // full set from BE
  roles: any[] = []; // filtered view bound to the table

  // ── Filter (debounced, client-side) ───────────────────────────────────
  filterName = '';
  private filter$ = new Subject<void>();

  // ── Membership dialog ─────────────────────────────────────────────────
  showMembership = false;
  membershipMode: 'attach' | 'detach' = 'attach';
  membershipRoles: string[] = []; // member role(s) — supports bulk
  membershipTarget = '';
  membershipAdminOption = false;

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

  private applyFilters(): void {
    const name = this.filterName.trim().toLowerCase();
    this.roles = name
      ? this.allRoles.filter(r =>
          String(r.name).toLowerCase().includes(name),
        )
      : [...this.allRoles];
    this.cdr.markForCheck();
  }

  get allRoleNames(): string[] {
    return (this.dbAccess.roles() ?? []).map(r => r.name);
  }

  /** {label,value} option list for the shared dropdowns/multiselects. */
  get allRoleOptions(): { label: string; value: string }[] {
    return this.allRoleNames.map(n => ({ label: n, value: n }));
  }

  memberCount(role: any): number {
    return role.memberCount ?? role.members?.length ?? 0;
  }

  // ── Navigation to full screens ──────────────────────────────────────────

  onAdd(): void {
    this.router.navigate([DB_ACCESS.roleNew(this.datasourceId)]);
  }

  onView(role: any): void {
    this.router.navigate([DB_ACCESS.roleView(this.datasourceId, role.name)]);
  }

  onEdit(role: any): void {
    this.router.navigate([DB_ACCESS.roleEdit(this.datasourceId, role.name)]);
  }

  // ── Membership ───────────────────────────────────────────────────────────

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
      this.membershipRoles.length === 1
        ? this.membershipRoles[0]
        : this.membershipRoles;

    this.confirmPhrase = null;

    if (this.membershipMode === 'attach') {
      const body: any = {
        role: roleArg,
        toRole: this.membershipTarget,
        adminOption: this.membershipAdminOption,
      };
      this.previewTitle = this.translate.instant(
        'DB_ACCESS.PREVIEW_GRANT_MEMBERSHIP',
      );
      this.previewDestructive = false;
      this.showMembership = false;
      const intent: ChangeIntent = {
        kind: 'grantMembership',
        role: roleArg,
        toRole: this.membershipTarget,
      };
      this.runPreviewAndArm(
        [intent],
        () =>
          this.dbAccess.attachRole(this.datasourceId, {
            ...body,
            previewOnly: true,
          }),
        () => this.dbAccess.attachRole(this.datasourceId, body),
      );
    } else {
      const body: any = {
        role: roleArg,
        toRole: this.membershipTarget,
        confirm: true,
      };
      this.previewTitle = this.translate.instant(
        'DB_ACCESS.PREVIEW_REVOKE_MEMBERSHIP',
      );
      this.previewDestructive = true;
      this.showMembership = false;
      const intent: ChangeIntent = {
        kind: 'revokeMembership',
        role: roleArg,
        toRole: this.membershipTarget,
      };
      this.runPreviewAndArm(
        [intent],
        () =>
          this.dbAccess.detachRole(this.datasourceId, {
            ...body,
            previewOnly: true,
          }),
        () => this.dbAccess.detachRole(this.datasourceId, body),
      );
    }
  }

  cancelMembership(): void {
    this.showMembership = false;
  }

  // ── Delete wizard ──────────────────────────────────────────────────────

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
    if (this.deleteMode === 'reassign' && this.reassignTo)
      base.reassignTo = this.reassignTo;
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
      () =>
        this.dbAccess.deleteRole(this.datasourceId, name, {
          ...base,
          previewOnly: true,
        }),
      () => this.dbAccess.deleteRole(this.datasourceId, name, base),
    );
  }

  // ── Shared confirm flow (plain-language summary; never SQL) ────────────

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
