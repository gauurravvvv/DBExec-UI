import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { DbAccessService } from '../../services/db-access.service';
import { DbGrantMatrixComponent } from '../db-grant-matrix/db-grant-matrix.component';
import { DbRolesComponent } from '../db-roles/db-roles.component';
import { DbUsersComponent } from '../db-users/db-users.component';

/**
 * DbAccessWorkspaceComponent — the LISTING landing for the module. A single
 * parent card holds a toolbar (datasource dropdown + Refresh + Create, all
 * in one row like list-dataset) and the feature tabs below. Picking a
 * datasource loads its data inline and reflects the selection in the URL
 * (/:datasourceId) so add / edit / view screens deep-link back. `canManage`
 * flows down so read-only mode disables mutations.
 *
 * Refresh + Create are context-aware: they act on the active tab (Users /
 * Roles listings). Switching away from the Privileges tab while a rule is
 * half-composed prompts a discard confirmation.
 */
@Component({
  selector: 'app-db-access-workspace',
  templateUrl: './db-access-workspace.component.html',
  styleUrls: ['./db-access-workspace.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbAccessWorkspaceComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('usersRef') usersRef?: DbUsersComponent;
  @ViewChild('rolesRef') rolesRef?: DbRolesComponent;
  @ViewChild('matrixRef') matrixRef?: DbGrantMatrixComponent;

  datasourceId = '';
  selectedDatasource: any = null;
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  capability: any = null;
  loadingCapability = false;
  unsupported = false; // non-postgres → 400 on capability
  activeIndex = 0;

  // Discard-changes popup (leaving the Privileges tab mid-composition).
  showDiscardPopup = false;
  private pendingTabIndex: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasourceService: DatasourceService,
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.loadDatasources();
    // The datasource id is optional — the '' route lands here with none,
    // and /:datasourceId lands here with one already chosen (deep link or
    // back-nav from an add / edit / view screen).
    this.datasourceId = this.route.snapshot.paramMap.get('datasourceId') ?? '';
    if (this.datasourceId) {
      this.selectedDatasource = this.datasourceId;
      this.probeCapability(this.datasourceId);
    }
  }

  ngOnDestroy(): void {
    this.datasourceService.cancelReads();
    this.dbAccess.cancelReads();
    this.dbAccess.reset();
  }

  loadDatasourcesPage = async ({
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
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  private loadDatasources(): void {
    this.datasourceService
      .listDatasource({ page: 1, limit: 10 })
      .then(res => {
        if (this.globalService.handleSuccessService(res, false)) {
          const items = res?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal = res?.data?.count ?? items.length;
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  onDatasourceChange(datasourceId: any): void {
    this.selectedDatasource = datasourceId;
    this.capability = null;
    this.unsupported = false;
    this.activeIndex = 0;
    this.dbAccess.reset();

    if (!datasourceId) {
      this.datasourceId = '';
      // Drop the id from the URL — stay on the bare listing landing.
      this.router.navigate(['/app/db-access']);
      this.cdr.markForCheck();
      return;
    }

    this.datasourceId = datasourceId;
    // Reflect the selection in the URL so add / edit / view can deep-link
    // back to this datasource. replaceUrl keeps the history clean.
    this.router.navigate(['/app/db-access', datasourceId], {
      replaceUrl: true,
    });
    this.probeCapability(datasourceId);
  }

  private probeCapability(datasourceId: string): void {
    this.loadingCapability = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadCapability(datasourceId)
      .then(res => {
        this.capability = res?.status ? res.data : null;
      })
      .catch(err => {
        // Non-postgres datasources 400 here.
        if (err?.status === 400 || err?.error?.code === 400)
          this.unsupported = true;
        this.capability = null;
      })
      .finally(() => {
        this.loadingCapability = false;
        this.cdr.markForCheck();
      });
  }

  get canManage(): boolean {
    return !!this.capability?.canManage;
  }

  // ── Tab switching (guard the privilege composer) ─────────────────────────

  /**
   * p-tabView (onChange) handler. Blocks a switch away from the Privileges
   * tab when a rule is half-composed, surfacing a discard confirmation
   * POPUP (not a native window.confirm).
   */
  onTabChange(event: { index: number }): void {
    const leavingMatrix =
      this.activeIndex === 2 && event.index !== 2 && this.matrixRef;
    if (leavingMatrix && this.matrixRef!.hasUnsavedChanges()) {
      this.pendingTabIndex = event.index;
      this.showDiscardPopup = true;
      // Snap the header back to Privileges until the user decides.
      setTimeout(() => {
        this.activeIndex = 2;
        this.cdr.markForCheck();
      });
      return;
    }
    this.activeIndex = event.index;
  }

  confirmDiscard(): void {
    this.showDiscardPopup = false;
    if (this.pendingTabIndex !== null) {
      this.matrixRef?.resetComposer();
      this.activeIndex = this.pendingTabIndex;
      this.pendingTabIndex = null;
      this.cdr.markForCheck();
    }
  }

  cancelDiscard(): void {
    this.showDiscardPopup = false;
    this.pendingTabIndex = null;
  }

  // ── Context-aware toolbar (Refresh + Create act on the active tab) ───────

  get showCreate(): boolean {
    return this.activeIndex === 0 || this.activeIndex === 1;
  }

  get createLabel(): string {
    return this.activeIndex === 1
      ? this.translate.instant('DB_ACCESS.CREATE_ROLE')
      : this.translate.instant('DB_ACCESS.CREATE_USER');
  }

  onAdd(): void {
    if (this.activeIndex === 1) {
      this.router.navigate([DB_ACCESS.roleNew(this.datasourceId)]);
    } else {
      this.router.navigate([DB_ACCESS.userNew(this.datasourceId)]);
    }
  }

  onManageMembership(): void {
    this.rolesRef?.openMembership('attach');
  }

  onRefresh(): void {
    switch (this.activeIndex) {
      case 0:
        this.usersRef?.load();
        break;
      case 1:
        this.rolesRef?.load();
        break;
      case 2:
        // Reload catalog data only — must NOT add a new rule (bug fix).
        this.matrixRef?.refresh();
        break;
      default:
        // Effective re-mounts on its own; nudge CD.
        this.cdr.markForCheck();
    }
  }
}
