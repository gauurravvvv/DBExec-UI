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
import { AnalysesService } from '../../services/analyses.service';

/**
 * Analyses listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE `/analyses`
 * list call. Infinite scroll (no page controls), a single global search plus
 * on-demand per-column filters (shared inputs), and per-row actions. No bulk
 * selection.
 *
 * Analyses is datasource-scoped: the adapter is built only once a datasource is
 * chosen (it needs `datasourceId` in every request), so the datasource picker
 * is projected into the table's toolbar-left slot. The page header and
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
    mode: 'scroll', // infinite scroll — no page controls
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

  /** Server-side adapter — bound on first datasource selection so
   *  the table doesn't fire an analyses query before a datasource exists. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private datasourceService: DatasourceService,
    private analysesService: AnalysesService,
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
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'ANALYSES.SEARCH_PLACEHOLDER',
      ),
    };

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
    this.analysesService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
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
  private bindAdapter(deepLinkName?: string) {
    if (!this.selectedDatasource) {
      this.adapter = null;
      return;
    }
    // Tear down any prior adapter so its in-flight call doesn't race
    // the new one's first load.
    this.adapter?.destroy();
    const dsId = this.selectedDatasource;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.analysesService.listAnalyses({
          datasourceId: dsId,
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

  /* ── deep linking — preserved ────────────────────────── */

  handleDeepLinking(params: any) {
    const datasourceId = params['datasourceId'] ? params['datasourceId'] : null;
    const name = params['name'];

    if (datasourceId) {
      this.loadDatasources(datasourceId, name);
    } else {
      this.loadDatasources(undefined, name);
    }
  }

  loadDatasources(preSelectedDbId?: string, deepLinkName?: string): Promise<void> {
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
              this.bindAdapter(deepLinkName);
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

  /* ── nav + per-row delete — UNCHANGED ────────────────── */

  onView(id: string) {
    this.router.navigate([ANALYSES.view(id)]);
  }

  onEdit(id: string) {
    this.router.navigate([ANALYSES.edit(id)]);
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
