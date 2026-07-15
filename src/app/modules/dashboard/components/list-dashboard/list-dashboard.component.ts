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
import { DASHBOARD as DB_ROUTES } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { FavouritesService } from 'src/app/shared/services/favourites.service';
import type { FolderObjectType } from 'src/app/shared/validators/folders';
import type { ExplorerObjectType } from 'src/app/shared/helpers/asset-icon.helper';
import { DashboardService } from '../../services/dashboard.service';

/**
 * Dashboard listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE `/dashboards`
 * list call. Infinite scroll (no page controls), a single global search plus
 * on-demand per-column filters (shared inputs), and per-row actions. No bulk
 * selection.
 *
 * Folder-first: the list now renders through the shared `<app-asset-explorer>`
 * (Folders|Tags rail + list body with type icons, favourite star, per-row
 * kebab). Dashboards do NOT require a datasource — the adapter loads ALL org
 * dashboards by folder/tag; a `?datasourceId=` deep-link still narrows as an
 * optional filter and `?name=` still pre-searches. The page header and
 * delete-confirm popup retain their existing behaviour.
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

  showDeleteConfirm = false;
  dashboardToDelete: string | null = null;
  deleteJustification = '';
  Math = Math;
  /** Optional datasource narrow carried from a `?datasourceId=` deep-link. */
  selectedDatasource: any = null;
  today = new Date();
  statusOptions: any[] = [];

  // Per-row spinner helper from the service.
  isDeleting = (id: string): boolean => this.dashboardService.isDeleting(id);

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    mode: 'scroll', // infinite scroll — no page controls
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE dashboards list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'dashboards-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — built once in ngOnInit; NO datasource gate now.
   *  The folder-first explorer browses ALL org dashboards by folder/tag, so the
   *  adapter loads dashboards without a datasourceId (the explorer's baseFilter
   *  supplies folderId / tags). */
  adapter: UsServerListAdapter<any> | null = null;

  /* ── folders / tags / favourites (Track F) ──────────────────────── */

  readonly objectType: FolderObjectType = 'dashboard';
  /** objectType typed for the shared explorer input. */
  readonly explorerObjectType: ExplorerObjectType = 'dashboard';
  favIds = this.favouritesService.ids;

  /** Columns the explorer inserts after its name column (module-specific). */
  explorerColumns: CustomTableColumn[] = [];

  constructor(
    private dashboardService: DashboardService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute,
    private translate: TranslateService,
    private favouritesService: FavouritesService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.cols = this.buildColumns();
    this.explorerColumns = this.buildExplorerColumns();
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'DASHBOARD.SEARCH_PLACEHOLDER',
      ),
    };

    // Build the datasource-free adapter once — the explorer browses ALL org
    // dashboards by folder/tag. A `?datasourceId=` deep-link still narrows the
    // list (optional filter), and `?name=` still pre-searches.
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const dsId = params['datasourceId'] || undefined;
        const name = params['name'] || undefined;
        this.selectedDatasource = dsId ?? null;
        this.bindAdapter(name);
      });

    // Warm the favourite-id set so each row's star renders correct state.
    this.favouritesService
      .refresh(this.objectType)
      .then(() => this.cdr.markForCheck());
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.dashboardService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'favourite', header: '', width: '56px', sortable: false, align: 'center' },
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text' },
      { colId: 'datasetName', field: 'datasetName', header: t('DASHBOARD.DATASET'), width: '192px', filter: 'text', sortable: false },
      { colId: 'datasourceName', field: 'datasource.name', header: t('COMMON.DATASOURCE'), width: '192px', filter: 'text', sortable: false },
      { colId: 'status', field: 'status', header: t('COMMON.STATUS'), width: '144px' },
      { colId: 'createdOn', field: 'createdOn', header: t('COMMON.CREATED_ON'), width: '192px' },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '144px', sortable: false },
    ];
  }

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Construct the server-side adapter. NO datasource gate — the folder-first
   * explorer browses ALL org dashboards; folder/tag come from the explorer's
   * baseFilter (merged by custom-table into each request's `filter`). A
   * `datasourceId` is sent only when a deep-link / optional filter selected one.
   */
  private bindAdapter(deepLinkName?: string) {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.dashboardService.listDashboard({
          ...(this.selectedDatasource
            ? { datasourceId: this.selectedDatasource }
            : {}),
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { dashboards: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.dashboards ?? [],
        total: res?.data?.count ?? 0,
      }),
      initial: {
        page: 1,
        limit: 50,
        ...(deepLinkName ? { filter: { name: deepLinkName } } : {}),
      },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  refreshList() {
    this.adapter?.reload();
  }

  /* ── asset-explorer output handlers (Track F folder-first) ──────── */

  /** Module-specific columns the explorer renders after the name column:
   *  the source dataset, its datasource, and the status pill. */
  private buildExplorerColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'datasetName', field: 'datasetName', header: t('DASHBOARD.DATASET'), width: '192px', sortable: false },
      { colId: 'datasourceName', field: 'datasource.name', header: t('COMMON.DATASOURCE'), width: '192px', sortable: false },
      { colId: 'status', field: 'status', header: t('COMMON.STATUS'), width: '144px', sortable: false },
    ];
  }

  /** Open (view) a dashboard — dashboards are view-only. */
  onOpen(row: any): void {
    if (row?.id) this.onView(row.id);
  }

  /** Rename maps to view for dashboards (view-only, no edit/rename form). */
  onRename(row: any): void {
    if (row?.id) this.onView(row.id);
  }

  /** Copy from the explorer kebab → duplicate the dashboard into the chosen
   *  target folder (null = source folder), then refresh the list. */
  onExplorerCopy(payload: { row: any; targetFolderId: string | null }): void {
    if (!payload?.row?.id) return;
    this.dashboardService
      .duplicate(payload.row.id, payload.targetFolderId)
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.refreshList();
        }
      })
      .catch(() => {
        /* global interceptor shows error toast */
      });
  }

  /* ── nav + delete ───────────────────────────────────── */

  onView(id: string) {
    this.router.navigate([DB_ROUTES.view(id)]);
  }

  confirmDelete(id: string) {
    this.dashboardToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.dashboardToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.dashboardToDelete) {
      this.dashboardService
        .delete(this.dashboardToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
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
    this.deleteJustification = '';
  }
}
