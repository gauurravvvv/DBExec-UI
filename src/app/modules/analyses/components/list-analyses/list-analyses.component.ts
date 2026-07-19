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
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { ANALYSES } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { FavouritesService } from 'src/app/shared/services/favourites.service';
import type { FavouriteObjectType } from 'src/app/shared/validators/favourites';
import { AnalysesService } from '../../services/analyses.service';

/**
 * Analyses listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE `/analyses`
 * list call. Infinite scroll (no page controls), a single global search plus
 * on-demand per-column filters (shared inputs), and per-row actions. No bulk
 * selection.
 *
 * There is NO datasource gate — the adapter is built once in `ngOnInit` and
 * browses ALL org analyses. A `?datasourceId=` deep-link still narrows the list
 * (optional filter) and `?name=` still pre-searches. The page header and
 * delete-confirm popup retain their existing behaviour.
 */
@Component({
  selector: 'app-list-analyses',
  templateUrl: './list-analyses.component.html',
  styleUrls: ['./list-analyses.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListAnalysesComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state — preserved from the p-table version ──── */

  showDeleteConfirm = false;
  analysisToDelete: string | null = null;
  deleteJustification = '';

  // Asset-share dialog state.
  showShareDialog = false;
  shareAssetId = '';
  shareAssetName = '';

  Math = Math;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedDatasource: any = null;
  today = new Date();
  statusOptions: any[] = [];

  /* ── per-row delete spinner helpers ─────────────────────── */

  isDeleting = (id: string): boolean => this.analysesService.isDeleting(id);

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE analyses list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'analyses-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — built once in ngOnInit; NO datasource gate. The
   *  list browses ALL org analyses; a `?datasourceId=` deep-link narrows it
   *  via the optional datasource filter. */
  adapter: UsServerListAdapter<any> | null = null;

  /* ── favourites ─────────────────────────────────────────────────── */

  readonly objectType: FavouriteObjectType = 'analysis';
  favIds = this.favouritesService.ids;

  /** Per-row favourite star helpers (delegate to the shared service). */
  isFavourite = (id: string): boolean =>
    this.favouritesService.isFavourite(this.objectType, id);
  toggleFavourite(id: string): void {
    this.favouritesService
      .toggle(this.objectType, id)
      .then(() => this.cdr.markForCheck());
  }

  constructor(
    private datasourceService: DatasourceService,
    private analysesService: AnalysesService,
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
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'ANALYSES.SEARCH_PLACEHOLDER',
      ),
    };

    // Build the datasource-free adapter once — the list browses ALL org
    // analyses. A `?datasourceId=` deep-link still narrows the list (optional
    // filter), and `?name=` still pre-searches.
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const dsId = params['datasourceId'] || undefined;
        const name = params['name'] || undefined;
        this.selectedDatasource = dsId ?? null;
        this.bindAdapter(name);
        // Still preload the datasource list for any create-from-dataset flow.
        this.loadDatasources();
      });

    // Warm the favourite-id set so each row's star renders correct state.
    this.favouritesService
      .refresh(this.objectType)
      .then(() => this.cdr.markForCheck());
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.analysesService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'favourite', header: '', width: '56px', sortable: false, align: 'center' },
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text' },
      { colId: 'description', field: 'description', header: t('COMMON.DESCRIPTION'), width: '320px', filter: 'text', sortable: false },
      { colId: 'datasetName', field: 'dataset.name', header: t('COMMON.DATASET'), width: '192px', filter: 'text', sortable: false },
      { colId: 'visuals', field: 'visuals', header: t('ANALYSES.VISUALS_COUNT'), width: '128px', sortable: false },
      { colId: 'status', field: 'status', header: t('COMMON.STATUS'), width: '144px' },
      { colId: 'createdOn', field: 'createdOn', header: t('COMMON.CREATED_ON'), width: '192px' },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '144px', sortable: false },
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

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Construct the server-side adapter. NO datasource gate — the list browses
   * ALL org analyses. A `datasourceId` is sent only when a deep-link / optional
   * filter selected one.
   */
  private bindAdapter(deepLinkName?: string) {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.analysesService.listAnalyses({
          ...(this.selectedDatasource
            ? { datasourceId: this.selectedDatasource }
            : {}),
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // Custom unwrap — the BE returns `{ analyses: [], count }`.
      // Some legacy callers saw `totalItems`; keep both for safety.
      unwrap: (res: any) => ({
        rows: res?.data?.analyses ?? [],
        total: res?.data?.count ?? res?.data?.totalItems ?? 0,
      }),
      // custom-table sends PLAIN filter values (global `search` + per-column
      // name/description/datasetName/status), so the adapter's identity mapping
      // passes them straight through — no AG-Grid cell unwrapping needed.
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

  /** Datasource filter changed — rebuild the adapter so the list re-queries
   *  scoped to (or cleared of) the selected datasource. Mirrors list-dataset. */
  onDatasourceChange(): void {
    this.bindAdapter();
  }

  /**
   * Preload the org's datasources — kept for any create-from-dataset flow that
   * needs a datasource at creation. No longer gates or binds the list adapter:
   * the list shows all analyses regardless of datasource.
   */
  loadDatasources(): Promise<void> {
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
          } else {
            this.datasources = [];
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
          this.datasources = [];
          this.cdr.markForCheck();
          resolve();
        });
    });
  }

  /* ── nav + per-row delete — UNCHANGED ────────────────── */

  onView(id: string) {
    this.router.navigate([ANALYSES.view(id)]);
  }

  onEdit(id: string) {
    this.router.navigate([ANALYSES.edit(id)]);
  }

  onShare(analysis: any): void {
    this.shareAssetId = analysis?.id ?? '';
    this.shareAssetName = analysis?.name ?? '';
    this.showShareDialog = true;
  }

  onShareClosed(): void {
    this.showShareDialog = false;
    this.shareAssetId = '';
    this.shareAssetName = '';
  }

  confirmDelete(id: string) {
    this.analysisToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.analysisToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.analysisToDelete) {
      this.analysesService
        .deleteAnalyses(this.analysisToDelete, reason)
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
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.analysisToDelete = null;
    this.deleteJustification = '';
  }
}
