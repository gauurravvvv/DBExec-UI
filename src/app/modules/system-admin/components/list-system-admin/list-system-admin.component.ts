import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import type { ColDef } from 'ag-grid-community';
import { SYSTEM_ADMIN } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { SystemAdminService } from '../../services/system-admin.service';

/**
 * System Admin listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the BE `/system-admins` list call. The
 * page header / content card / delete-confirm popup retain the existing
 * styling and behaviour; only the `<p-table>` was swapped out for the
 * AG Grid wrapper. There is no datasource dropdown here — system admins
 * are master-DB scoped — so the adapter binds on `ngOnInit`.
 */
@Component({
  selector: 'app-list-system-admin',
  templateUrl: './list-system-admin.component.html',
  styleUrls: ['./list-system-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSystemAdminComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state — UNCHANGED from the p-table version ──── */

  loggedInUserId: any;
  selectedAdmins: any[] = [];
  showDeleteConfirm = false;
  adminIdToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  // Per-row spinner helpers — template asks for the id and the service
  // tells us whether THAT row's delete / unlock is in flight. Other
  // rows stay clickable.
  isDeleting = (id: string): boolean => this.systemAdminService.isDeleting(id);
  isUnlocking = (id: string): boolean =>
    this.systemAdminService.isUnlocking(id);
  get isBulkDeleting(): boolean {
    return this.selectedAdmins.some(a =>
      this.systemAdminService.isDeleting(a.id),
    );
  }

  /* ── grid wiring ───────────────────────────────────────── */

  /** AG Grid column definitions — widths preserved from the old
   *  `<p-table>` so the visual layout is unchanged. cellRenderer
   *  templates live in the HTML as `<ng-template usGridCell>`. */
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
    gridKey: 'system-admins-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 280px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound synchronously in ngOnInit because
   *  there's no datasource gate for this list. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private systemAdminService: SystemAdminService,
    private router: Router,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.loggedInUserId = this.globalService.getTokenDetails('userId');
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.cols = this.buildColumns();
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.systemAdminService.cancelReads();
    this.adapter?.destroy();
  }

  get selectedCount(): number {
    return this.selectedAdmins?.length || 0;
  }

  get isFilterActive(): boolean {
    return !!this.adapter && Object.keys(this.adapter.filterModel()).length > 0;
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): ColDef[] {
    return [
      {
        colId: 'username',
        field: 'username',
        headerName: this.translate.instant('COMMON.USERNAME'),
        width: 192,
        minWidth: 192,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        pinned: 'left',
      },
      {
        colId: 'firstName',
        field: 'firstName',
        headerName: this.translate.instant('COMMON.FIRST_NAME'),
        width: 160,
        minWidth: 160,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'lastName',
        field: 'lastName',
        headerName: this.translate.instant('COMMON.LAST_NAME'),
        width: 160,
        minWidth: 160,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'email',
        field: 'email',
        headerName: this.translate.instant('COMMON.EMAIL'),
        minWidth: 288,
        flex: 1,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
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
        colId: 'lastLogin',
        field: 'lastLogin',
        headerName: this.translate.instant('COMMON.LAST_LOGIN'),
        width: 192,
        minWidth: 192,
        filter: 'agDateColumnFilter',
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

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Construct the server-side adapter. Called once from ngOnInit —
   * unlike the tabs module there's no datasource to gate on.
   */
  private bindAdapter() {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.systemAdminService.listSystemAdmins({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // Custom unwrap — the BE returns `{ systemAdmins: [], count }`.
      unwrap: (res: any) => ({
        rows: res?.data?.systemAdmins ?? [],
        total: res?.data?.count ?? 0,
      }),
      // Floating-filter cell value → BE filter slice. The grid's
      // floating filters emit AG-Grid-shaped cells; this map flattens
      // them into the shape the BE expects.
      filterBuilders: {
        username: cell => ({ username: (cell as any)?.filter ?? cell }),
        firstName: cell => ({ firstName: (cell as any)?.filter ?? cell }),
        lastName: cell => ({ lastName: (cell as any)?.filter ?? cell }),
        email: cell => ({ email: (cell as any)?.filter ?? cell }),
        status: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined
            ? {}
            : { status: v };
        },
        lastLogin: cell => {
          // BE expects lastLoginDateFrom / lastLoginDateTo (mirrors
          // the createdDate* naming on the same controller).
          const c = cell as any;
          const out: Record<string, string> = {};
          if (c?.dateFrom)
            out['lastLoginDateFrom'] = new Date(c.dateFrom).toISOString();
          if (c?.dateTo) {
            const to = new Date(c.dateTo);
            to.setHours(23, 59, 59, 999);
            out['lastLoginDateTo'] = to.toISOString();
          }
          return out;
        },
        createdOn: cell => {
          const c = cell as any;
          const out: Record<string, string> = {};
          if (c?.dateFrom)
            out['createdDateFrom'] = new Date(c.dateFrom).toISOString();
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
    // Defensive — drop default admins, the logged-in user, and any row
    // the BE flagged non-deletable. The grid's isRowSelectable hook
    // should already prevent it, but the bulk-delete CTA reads off
    // this array so we double-guard.
    this.selectedAdmins = (rows || []).filter(
      a =>
        a?.isDefault !== 1 &&
        a?.id !== this.loggedInUserId &&
        a?.canDelete !== false,
    );
    this.cdr.markForCheck();
  }

  clearFilters() {
    if (!this.adapter) return;
    this.adapter.setFilter({});
    this.adapter.setSort([]);
    this.selectedAdmins = [];
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + per-row actions — UNCHANGED ───────────────── */

  onAddNewAdmin() {
    this.router.navigate([SYSTEM_ADMIN.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([SYSTEM_ADMIN.edit(id)]);
  }

  onUnlock(id: string) {
    this.systemAdminService.unlock(id).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        this.refreshList();
      }
      this.cdr.markForCheck();
    });
  }

  confirmDelete(id: string) {
    this.adminIdToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.adminIdToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminIdToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedAdmins.map(a => a.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.systemAdminService
        .bulkDelete(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedAdmins = [];
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

    if (this.adminIdToDelete) {
      const id = this.adminIdToDelete;
      this.systemAdminService
        .delete(id, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedAdmins = this.selectedAdmins.filter(a => a.id !== id);
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
    this.adminIdToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }
}
