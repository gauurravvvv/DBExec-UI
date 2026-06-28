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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import type { ColDef } from 'ag-grid-community';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { DASHBOARD as DB_ROUTES } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { DashboardService } from '../../services/dashboard.service';

/**
 * Dashboard listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the BE `/dashboards` list call. The
 * page header / datasource dropdown / delete-confirm popup retain the
 * existing styling and behaviour; only the `<p-table>` was swapped
 * out for the AG Grid wrapper.
 */
@Component({
  selector: 'app-list-dashboard',
  templateUrl: './list-dashboard.component.html',
  styleUrls: ['./list-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDashboardComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state — preserved from the p-table version ─── */

  selectedDashboards: any[] = [];
  showDeleteConfirm = false;
  dashboardToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  Math = Math;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedDatasource: any = null;
  today = new Date();
  statusOptions: any[] = [];

  // Per-row spinner helpers from the service.
  isDeleting = (id: string): boolean => this.dashboardService.isDeleting(id);
  get isBulkDeleting(): boolean {
    return this.selectedDashboards.some(d =>
      this.dashboardService.isDeleting(d.id),
    );
  }

  /* ── grid wiring ───────────────────────────────────────── */

  /** AG Grid column definitions. Cell renderers live in the HTML as
   *  `<ng-template usGridCell>` so the visual layout is unchanged
   *  from the previous `<p-table>` markup. */
  cols: ColDef[] = [];

  gridConfig: UsDataGridConfig = {
    enableRowSelection: true,
    rowSelectionMode: 'multiple',
    freezeFirstColumn: true,
    enableColumnChooser: true,
    enableAddFilter: false, // BE-driven floating filters
    enableAutoFit: true,
    enableDensityToggle: true,
    enableCsvExport: true,
    enableXlsxExport: true,
    enableRefresh: true,
    enableSavedViews: true,
    gridKey: 'dashboards-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 340px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound on first datasource selection so
   *  the grid doesn't fire a dashboards query before a datasource
   *  exists. Rebuilt on every datasource change so the closed-over
   *  `datasourceId` stays in lockstep with the dropdown. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private datasourceService: DatasourceService,
    private dashboardService: DashboardService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.cols = this.buildColumns();

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        if (params['datasourceId'] || params['name']) {
          this.handleDeepLinking(params);
        } else {
          this.loadDatasources();
        }
      });
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.dashboardService.cancelReads();
    this.adapter?.destroy();
  }

  get selectedCount(): number {
    return this.selectedDashboards?.length || 0;
  }

  get isFilterActive(): boolean {
    return !!this.adapter && Object.keys(this.adapter.filterModel()).length > 0;
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
        colId: 'datasetName',
        field: 'datasetName',
        headerName: this.translate.instant('DASHBOARD.DATASET'),
        width: 192,
        minWidth: 192,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
      {
        colId: 'datasourceName',
        field: 'datasource.name',
        headerName: this.translate.instant('COMMON.DATASOURCE'),
        width: 192,
        minWidth: 192,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
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

  /* ── datasource dropdown — UNCHANGED ─────────────────── */

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

  onDBChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
    this.bindAdapter();
  }

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Construct (or rebuild) the server-side adapter once a datasource
   * has been picked. The adapter needs `datasourceId` in every
   * request, so we close over the current selection.
   */
  private bindAdapter() {
    if (!this.selectedDatasource) {
      this.adapter = null;
      return;
    }
    // Tear down any prior adapter so its in-flight call doesn't
    // race the new one's first load.
    this.adapter?.destroy();
    const dsId = this.selectedDatasource;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.dashboardService.listDashboard({
          datasourceId: dsId,
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // Custom unwrap — the BE returns `{ data: { dashboards: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.dashboards ?? [],
        total: res?.data?.count ?? 0,
      }),
      // Floating-filter cell value → BE filter slice. AG Grid emits
      // cell-shaped values; this map flattens them into the
      // `{name, datasetName, datasourceName, status, createdDateFrom,
      // createdDateTo}` shape the BE expects.
      filterBuilders: {
        name: cell => ({ name: (cell as any)?.filter ?? cell }),
        datasetName: cell => ({
          datasetName: (cell as any)?.filter ?? cell,
        }),
        datasourceName: cell => ({
          datasourceName: (cell as any)?.filter ?? cell,
        }),
        status: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined ? {} : { status: v };
        },
        createdOn: cell => {
          // AG Grid date filter shape: {dateFrom, dateTo, type, filterType}.
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
    this.selectedDashboards = rows;
    this.cdr.markForCheck();
  }

  clearFilters() {
    if (!this.adapter) return;
    this.adapter.setFilter({});
    this.adapter.setSort([]);
    this.selectedDashboards = [];
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── deep linking — preserved ────────────────────────── */

  handleDeepLinking(params: any) {
    const datasourceId = params['datasourceId'] ? params['datasourceId'] : null;
    const name = params['name'];

    if (datasourceId) {
      this.loadDatasources(datasourceId).then(() => {
        if (name && this.adapter) {
          this.adapter.patchFilter({ name });
        }
      });
    } else {
      this.loadDatasources();
    }
  }

  loadDatasources(preSelectedDbId?: string): Promise<void> {
    return new Promise(resolve => {
      const params = { page: DEFAULT_PAGE, limit: 10 };
      this.datasourceService
        .listDatasource(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            const items = response?.data?.datasources ?? [];
            this.preloadedDatasources = items;
            this.preloadedDatasourcesTotal =
              response?.data?.count ?? items.length;
            this.datasources = [...items];
            if (this.datasources.length > 0) {
              this.selectedDatasource =
                preSelectedDbId &&
                this.datasources.find(d => d.id === preSelectedDbId)
                  ? preSelectedDbId
                  : this.datasources[0].id;
              this.bindAdapter();
            } else {
              this.selectedDatasource = null;
              this.adapter = null;
            }
          } else {
            this.datasources = [];
            this.selectedDatasource = null;
            this.adapter = null;
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
          this.datasources = [];
          this.selectedDatasource = null;
          this.adapter = null;
          this.cdr.markForCheck();
          resolve();
        });
    });
  }

  /* ── nav + bulk-delete ──────────────────────────────── */

  onView(id: string) {
    this.router.navigate([DB_ROUTES.view(id)]);
  }

  confirmDelete(id: string) {
    this.dashboardToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.dashboardToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.dashboardToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedDashboards.map(d => d.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.dashboardService
        .bulkDelete(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedDashboards = [];
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

    if (this.dashboardToDelete) {
      this.dashboardService
        .delete(this.dashboardToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedDashboards = this.selectedDashboards.filter(
              d => d.id !== this.dashboardToDelete,
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
      return;
    }
    this.closeDeletePopup();
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.dashboardToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }
}
