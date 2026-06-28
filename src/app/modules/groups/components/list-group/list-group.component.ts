import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import type { ColDef } from 'ag-grid-community';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { GROUP } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { RoleService } from 'src/app/modules/role/services/role.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { GroupService } from '../../services/group.service';

/**
 * Group listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the BE `/groups` list call. Unlike
 * the tab listing, groups has NO datasource dropdown so the adapter
 * is bound in `ngOnInit` directly. The Role filter (a server-mode
 * dropdown) lives in the card toolbar above the grid and feeds an
 * additional `roleId` param into the load fn — rebuilding the
 * adapter on role change keeps the closure in sync.
 */
@Component({
  selector: 'app-list-group',
  templateUrl: './list-group.component.html',
  styleUrls: ['./list-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListGroupComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  selectedGroups: any[] = [];
  showDeleteConfirm = false;
  groupToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  Math = Math;
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  // Role filter — server-mode dropdown outside the grid.
  roles: any[] = [];
  selectedRole: string | null = null;
  preloadedRoles: any[] | null = null;
  preloadedRolesTotal: number | null = null;

  // Per-row spinner helpers — the BE delete promise sets a per-id
  // flag on the service so each row can spin independently.
  isDeleting = (id: string): boolean => this.groupService.isDeleting(id);
  get isBulkDeleting(): boolean {
    return this.selectedGroups.some(g => this.groupService.isDeleting(g.id));
  }

  /* ── grid wiring ───────────────────────────────────────── */

  cols: ColDef[] = [];

  gridConfig: UsDataGridConfig = {
    enableRowSelection: true,
    rowSelectionMode: 'multiple',
    freezeFirstColumn: true,
    enableColumnChooser: true,
    enableAddFilter: false, // we use the BE-driven floating filters
    enableAutoFit: true,
    enableDensityToggle: true,
    enableCsvExport: true,
    enableXlsxExport: true,
    enableRefresh: true,
    enableSavedViews: true,
    gridKey: 'groups-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    // No datasource dropdown = more vertical space than tabs.
    height: 'calc(100vh - 280px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound in `ngOnInit` (no datasource gate). */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private groupService: GroupService,
    private roleService: RoleService,
    private router: Router,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.cols = this.buildColumns();
    this.loadRoles();
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away. The adapter
    // itself cancels via the rxjs subscription teardown but the
    // service still has its own cancel pipe.
    this.groupService.cancelReads();
    this.adapter?.destroy();
  }

  get selectedCount(): number {
    return this.selectedGroups?.length || 0;
  }

  get isFilterActive(): boolean {
    return (
      (!!this.adapter && Object.keys(this.adapter.filterModel()).length > 0) ||
      !!this.selectedRole
    );
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): ColDef[] {
    return [
      {
        colId: 'name',
        field: 'name',
        headerName: this.translate.instant('COMMON.NAME'),
        width: 224,
        minWidth: 224,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        pinned: 'left',
      },
      {
        colId: 'description',
        field: 'description',
        headerName: this.translate.instant('COMMON.DESCRIPTION'),
        minWidth: 320,
        flex: 1,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
      {
        colId: 'roleName',
        field: 'roleName',
        headerName: this.translate.instant('COMMON.ROLE'),
        width: 192,
        minWidth: 192,
        sortable: false,
        filter: false,
      },
      {
        colId: 'status',
        field: 'status',
        headerName: this.translate.instant('COMMON.STATUS'),
        width: 144,
        minWidth: 144,
        filter: 'agNumberColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'createdOn',
        field: 'createdOn',
        headerName: this.translate.instant('COMMON.CREATED_ON'),
        width: 192,
        minWidth: 192,
        filter: 'agDateColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'actions',
        headerName: this.translate.instant('COMMON.ACTIONS'),
        width: 112,
        minWidth: 112,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'right',
      },
    ];
  }

  /* ── role filter dropdown ────────────────────────────── */

  loadRolesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = { name: search };
    try {
      const res: any = await this.roleService.listRoles(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.roles ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /** Preload page 1 of roles so the dropdown can render without a fresh fetch
   *  on first open. */
  loadRoles() {
    this.roleService
      .listRoles({ page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const roles = response?.data?.roles ?? [];
          this.roles = roles;
          this.preloadedRoles = roles;
          this.preloadedRolesTotal = response?.data?.count ?? roles.length;
        }
        this.cdr.markForCheck();
      });
  }

  onRoleChange(roleId: string | null) {
    this.selectedRole = roleId;
    this.selectedGroups = [];
    // The adapter closes over selectedRole — rebuild so the next
    // load picks up the new value.
    this.bindAdapter();
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter() {
    // Tear down any prior adapter so its in-flight call doesn't race
    // the new one's first load.
    this.adapter?.destroy();
    const roleId = this.selectedRole;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.groupService.listGroups({
          page: params.page,
          limit: params.limit,
          ...(roleId ? { roleId } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { groups: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.groups ?? [],
        total: res?.data?.count ?? 0,
      }),
      // Floating-filter cell value → BE filter slice. Flattens the
      // AG-Grid-shaped cells into the
      // `{name, description, status, createdDateFrom, createdDateTo}`
      // shape the BE expects.
      filterBuilders: {
        name: cell => ({ name: (cell as any)?.filter ?? cell }),
        description: cell => ({
          description: (cell as any)?.filter ?? cell,
        }),
        status: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined ? {} : { status: v };
        },
        createdOn: cell => {
          // AG Grid date filter shapes: {dateFrom, dateTo, type, filterType}.
          const c = cell as any;
          const out: Record<string, string> = {};
          if (c?.dateFrom) out['createdDateFrom'] = new Date(c.dateFrom).toISOString();
          if (c?.dateTo) {
            const to = new Date(c.dateTo);
            to.setHours(23, 59, 59, 999);
            out['createdDateTo'] = to.toISOString();
          }
          return out;
        },
      },
      initial: { page: 1, limit: 10 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  onSelectionChange(rows: any[]) {
    // Default groups are not selectable for bulk-delete — filter them
    // out defensively in case the grid surfaces them.
    this.selectedGroups = (rows ?? []).filter(r => r?.isDefault !== 1);
    this.cdr.markForCheck();
  }

  isRowSelectable = (event: any) => event?.data?.isDefault !== 1;

  clearFilters() {
    if (this.adapter) {
      this.adapter.setFilter({});
      this.adapter.setSort([]);
    }
    this.selectedRole = null;
    this.selectedGroups = [];
    this.bindAdapter();
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + delete ───────────────────────────────────── */

  onAddNewCategory() {
    this.router.navigate([GROUP.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([GROUP.edit(id)]);
  }

  confirmDelete(id: string) {
    this.groupToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.groupToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedGroups.map(g => g.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.groupService
        .bulkDelete(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedGroups = [];
            this.refreshList();
          }
        })
        .catch(() => {
          /* global interceptor shows error toast */
        })
        .finally(() => {
          this.closeDeletePopup();
          this.cdr.markForCheck();
        });
      return;
    }

    if (this.groupToDelete) {
      this.groupService
        .delete(this.groupToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedGroups = this.selectedGroups.filter(
              g => g.id !== this.groupToDelete,
            );
            this.refreshList();
          }
        })
        .catch(() => {
          /* global interceptor shows error toast */
        })
        .finally(() => {
          this.closeDeletePopup();
          this.cdr.markForCheck();
        });
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }
}
