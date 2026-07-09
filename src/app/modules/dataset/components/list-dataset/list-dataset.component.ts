import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import {
  ANALYSES,
  DATASET,
  QUERY_BUILDER,
} from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { AnalysisFormData } from 'src/app/modules/analyses/components/save-analyses-dialog/save-analyses-dialog.component';
import { AnalysesService } from 'src/app/modules/analyses/services/analyses.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { QueryBuilderService } from 'src/app/modules/query-builder/services/query-builder.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { DatasetService } from '../../services/dataset.service';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';

/**
 * Dataset listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE `/datasets`
 * list call. Infinite scroll (no page controls), a single global search plus
 * on-demand per-column filters (shared inputs), and per-row actions. No bulk
 * selection.
 *
 * Dataset is datasource-scoped: the adapter is built only once a datasource is
 * chosen (it needs `datasourceId` in every request), so the datasource picker
 * is projected into the table's toolbar-left slot. The page header, QB command
 * palette, duplicate / create-analysis dialogs and delete-confirm popup retain
 * their existing behaviour.
 */
@Component({
  selector: 'app-list-dataset',
  templateUrl: './list-dataset.component.html',
  styleUrls: ['./list-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDatasetComponent implements OnInit, OnDestroy {
  @ViewChild('qbSearchInput') qbSearchInput!: ElementRef;

  /* ── page state — preserved from the p-table version ─── */

  showDeleteConfirm = false;
  deleteJustification = '';
  datasetToDelete: string | null = null;
  showDuplicateDialog = false;
  datasetToDuplicate: any = null;
  activeDataset: any = null;
  showQueryBuilderPopup = false;
  queryBuilders: any[] = [];
  loadingQueryBuilders = false;
  qbSearchTerm = '';
  qbTotalRecords = 0;
  qbActiveIndex = -1;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedDatasource: any = null;
  saving = this.datasetService.saving;
  today = new Date();
  statusOptions: any[] = [];

  // Per-row spinner helpers.
  isDeleting = (id: string): boolean => this.datasetService.isDeleting(id);

  addDatasetItems: MenuItem[] = [];

  // Datasource picker popup state.
  showDsPickerPopup = false;

  // Create Analysis dialog.
  showCreateAnalysisDialog = false;
  analysisDatasetId: string = '';

  // Debouncing for QB search.
  private qbFilter$ = new Subject<void>();

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    mode: 'scroll', // infinite scroll — no page controls
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE datasets list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'datasets-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound on first datasource selection so
   *  the table doesn't fire a datasets query before a datasource exists. */
  adapter: UsServerListAdapter<any> | null = null;

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  constructor(
    private router: Router,
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private datasourceService: DatasourceService,
    private queryBuilderService: QueryBuilderService,
    private analysesService: AnalysesService,
    private route: ActivatedRoute,
    private translate: TranslateService,
  ) {}

  trackById(index: number, item: any): any {
    return item.id;
  }

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.addDatasetItems = [
      {
        label: this.translate.instant('DATASET.VIA_QUERY_BUILDER'),
        icon: 'pi pi-comments',
        command: () => this.onAddViaPrompts(),
      },
    ];

    this.cols = this.buildColumns();
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'DATASET.SEARCH_PLACEHOLDER',
      ),
    };

    // Setup debounced QB search
    this.qbFilter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadQueryBuilders();
      });

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
    this.datasetService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text' },
      { colId: 'description', field: 'description', header: t('COMMON.DESCRIPTION'), width: '320px', filter: 'text', sortable: false },
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
   * Construct (or rebuild) the server-side adapter once a
   * datasource has been picked. The adapter needs `datasourceId`
   * in every request, so we close over the current selection.
   */
  private bindAdapter(deepLinkName?: string) {
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
        this.datasetService.listDatasets({
          datasourceId: dsId,
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ datasets: [], totalItems | count }`.
      unwrap: (res: any) => ({
        rows: res?.data?.datasets ?? [],
        total: res?.data?.totalItems ?? res?.data?.count ?? 0,
      }),
      // custom-table sends PLAIN filter values (global `search` + per-column
      // name/description/status), so the adapter's identity mapping passes
      // them straight through — no AG-Grid cell unwrapping needed.
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

  /* ── add navigation ─────────────────────────────────── */

  /**
   * Open the datasource-picker popup. Previously routed straight to
   * /datasets/new; the popup is the new entry point so the add page
   * doesn't have to show org + datasource dropdowns.
   */
  onAddNewAdmin() {
    this.showDsPickerPopup = true;
  }

  onDsPickerDialogClose(
    result:
      | import('../dataset-picker-dialog/dataset-picker-dialog.component').DatasetPickerResult
      | null,
  ): void {
    this.showDsPickerPopup = false;
    if (!result) return;
    const queryParams: any = { datasourceId: result.datasource?.id };
    if (result.schema) queryParams.schema = result.schema;
    this.router.navigate([DATASET.ADD], {
      queryParams,
      state: { datasource: result.datasource },
    });
  }

  onAddViaPrompts() {
    this.qbSearchTerm = '';
    this.qbActiveIndex = -1;
    this.showQueryBuilderPopup = true;
    this.loadQueryBuilders();
    setTimeout(() => this.qbSearchInput?.nativeElement?.focus());
  }

  closeQueryBuilderPopup() {
    this.showQueryBuilderPopup = false;
    this.qbSearchTerm = '';
    this.qbActiveIndex = -1;
  }

  onQbSearch() {
    this.qbActiveIndex = -1;
    this.qbFilter$.next();
  }

  onQbKeydown(event: KeyboardEvent) {
    const len = this.queryBuilders.length;
    if (!len) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.qbActiveIndex =
        this.qbActiveIndex < len - 1 ? this.qbActiveIndex + 1 : 0;
      this.scrollQbActiveIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.qbActiveIndex =
        this.qbActiveIndex > 0 ? this.qbActiveIndex - 1 : len - 1;
      this.scrollQbActiveIntoView();
    } else if (event.key === 'Enter' && this.qbActiveIndex >= 0) {
      event.preventDefault();
      this.onQueryBuilderSelect(this.queryBuilders[this.qbActiveIndex]);
    } else if (event.key === 'Escape') {
      this.closeQueryBuilderPopup();
    }
  }

  private scrollQbActiveIntoView() {
    setTimeout(() => {
      const el = document.querySelector('.cmd-row.active');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  private loadQueryBuilders() {
    if (!this.selectedDatasource) return;

    this.loadingQueryBuilders = true;
    // Command-palette popup: search is debounced + server-side, so the user
    // narrows results by typing. Capped to 50 per page; if there are more,
    // they can refine the query rather than scroll a huge list.
    const params: any = {
      datasourceId: this.selectedDatasource,
      page: 1,
      limit: 50,
    };

    const term = this.qbSearchTerm.trim();
    if (term) {
      params.filter = JSON.stringify({ name: term });
    }

    this.queryBuilderService
      .listQueryBuilder(params)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.queryBuilders = response.data?.queryBuilders || [];
          this.qbTotalRecords =
            response.data?.count || this.queryBuilders.length;
        } else {
          this.queryBuilders = [];
          this.qbTotalRecords = 0;
        }
        this.loadingQueryBuilders = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.queryBuilders = [];
        this.qbTotalRecords = 0;
        this.loadingQueryBuilders = false;
        this.cdr.markForCheck();
      });
  }

  onQueryBuilderSelect(queryBuilder: any) {
    this.showQueryBuilderPopup = false;
    this.router.navigate([
      QUERY_BUILDER.run(this.selectedDatasource, queryBuilder.id),
    ]);
  }

  onEdit(id: string) {
    this.router.navigate([DATASET.edit(id)]);
  }

  useAsAnalysis(id: string) {
    this.analysisDatasetId = id;
    this.showCreateAnalysisDialog = true;
  }

  onCreateAnalysisDialogClose(result: AnalysisFormData | null) {
    if (result && this.analysisDatasetId) {
      this.analysesService
        .addAnalyses({
          name: result.name,
          description: result.description,
          datasetId: this.analysisDatasetId,
          datasource: this.selectedDatasource,
        })
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response, true)) {
            this.router.navigate([ANALYSES.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
    this.showCreateAnalysisDialog = false;
    this.analysisDatasetId = '';
  }

  confirmDuplicate(dataset: any) {
    this.datasetToDuplicate = dataset;
    this.showDuplicateDialog = true;
  }

  onDuplicateDialogClose(result: DatasetFormData | null) {
    if (result && this.datasetToDuplicate) {
      this.datasetService
        .duplicateDataset(
          this.datasetToDuplicate.id,
          result.name,
          result.description,
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
    this.showDuplicateDialog = false;
    this.datasetToDuplicate = null;
  }

  /* ── delete flow — UNCHANGED ─────────────────────────── */

  confirmDelete(id: string) {
    this.datasetToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.datasetToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.datasetToDelete) {
      this.datasetService
        .deleteDataset(this.datasetToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.datasetToDelete = null;
    this.deleteJustification = '';
  }
}
