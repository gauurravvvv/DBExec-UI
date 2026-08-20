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
import { QUERY_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ConnectorService } from 'src/app/modules/connector/services/connector.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { QueryBuilderService } from '../../services/query-builder.service';

/**
 * Query Builder listing — renders through the shared `<app-custom-table>` (the
 * app's unified list table) driven by a `UsServerListAdapter` on the BE
 * query-builder list call. Infinite scroll (no page controls), a global search
 * plus on-demand per-column filters, and per-row actions. No bulk selection.
 *
 * A query-builder list is datasource-scoped, so the screen keeps its datasource
 * dropdown (server-mode) projected into the table's toolbar-left slot. The
 * adapter closes over the selected connectorId; selecting a datasource
 * rebuilds the adapter so the next load carries the new scope.
 */
@Component({
  selector: 'app-list-query-builder',
  templateUrl: './list-query-builder.component.html',
  styleUrls: ['./list-query-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListQueryBuilderComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  showDeleteConfirm = false;
  queryBuilderToDelete: string | null = null;
  deleteJustification = '';
  today = new Date();

  // Datasource filter — server-mode dropdown outside the grid (toolbar-left).
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedDatasource: any = null;

  // Deep-link name filter, applied to the adapter's initial filter.
  private deepLinkName: string | null = null;

  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'name', // query-builder list matches a `name` filter
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'query-builders-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound only once a datasource is selected, and
   *  rebuilt whenever the datasource changes so the closure picks up the
   *  new scope. Null until the first datasource resolves. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private datasourceService: ConnectorService,
    private queryBuilderService: QueryBuilderService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.cols = this.buildColumns();
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant('COMMON.SEARCH_NAME'),
    };

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        if (params['connectorId'] || params['name']) {
          this.handleDeepLinking(params);
        } else {
          this.loadDatasources();
        }
      });
  }

  ngOnDestroy() {
    this.queryBuilderService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        colId: 'name',
        field: 'name',
        header: t('COMMON.NAME'),
        width: '224px',
        frozen: true,
        filter: 'text',
      },
      {
        colId: 'description',
        field: 'description',
        header: t('COMMON.DESCRIPTION'),
        width: '320px',
        filter: 'text',
      },
      {
        colId: 'status',
        field: 'status',
        header: t('COMMON.STATUS'),
        width: '144px',
        sortable: false,
      },
      {
        colId: 'createdOn',
        field: 'createdOn',
        header: t('COMMON.CREATED_ON'),
        width: '192px',
        sortable: false,
      },
      {
        colId: 'actions',
        header: t('COMMON.ACTIONS'),
        width: '184px',
        sortable: false,
      },
    ];
  }

  /* ── deep-linking ────────────────────────────────────── */

  handleDeepLinking(params: any) {
    const connectorId = params['connectorId'] ? params['connectorId'] : null;
    const name = params['name'];

    if (name) {
      this.deepLinkName = name;
    }

    if (connectorId) {
      this.loadDatasources(connectorId);
    } else {
      this.loadDatasources();
    }
  }

  /* ── datasource filter dropdown ──────────────────────── */

  /**
   * Fetcher for the server-mode datasource dropdown.
   */
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

  loadDatasources(preSelectedDbId?: string): Promise<void> {
    return new Promise(resolve => {
      const params = {
        page: DEFAULT_PAGE,
        limit: 10,
      };

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
              if (
                preSelectedDbId &&
                this.datasources.find(d => d.id === preSelectedDbId)
              ) {
                this.selectedDatasource = preSelectedDbId;
              } else {
                this.selectedDatasource = this.datasources[0].id;
              }
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

  onDBChange(connectorId: any) {
    this.selectedDatasource = connectorId;
    this.bindAdapter();
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter() {
    this.adapter?.destroy();
    if (!this.selectedDatasource) {
      this.adapter = null;
      this.cdr.markForCheck();
      return;
    }
    const connectorId = this.selectedDatasource;
    const name = this.deepLinkName;
    this.deepLinkName = null;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) => {
        // connectorId is a top-level query param, NOT inside the JSON filter.
        const req: any = {
          connectorId,
          page: params.page,
          limit: params.limit,
        };
        if (params.sort) req.sort = params.sort;
        if (params.filter) req.filter = params.filter;
        return this.queryBuilderService.listQueryBuilder(req);
      },
      // BE returns `{ data: { queryBuilders: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.queryBuilders ?? [],
        total: res?.data?.count ?? 0,
      }),
      initial: {
        page: 1,
        limit: 50,
        ...(name ? { filterModel: { name } } : {}),
      },
    });
    this.cdr.markForCheck();
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + per-row delete ────────────────────────────── */

  onAddNewQueryBuilder() {
    this.router.navigate([QUERY_BUILDER.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([QUERY_BUILDER.edit(id)]);
  }

  onConfig(id: string) {
    // Query Builder v2 — open the admin design shell (form / joins / columns /
    // settings). Replaces the removed configure screen.
    this.router.navigate([QUERY_BUILDER.design(id)]);
  }

  onExecute(id: string) {
    // Query Builder v2 — open the business-user composer (tree filters + run).
    this.router.navigate([QUERY_BUILDER.compose(id)]);
  }

  confirmDelete(id: string) {
    this.queryBuilderToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.queryBuilderToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.queryBuilderToDelete) {
      this.queryBuilderService
        .deleteQueryBuilder(this.queryBuilderToDelete, reason)
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
    this.queryBuilderToDelete = null;
    this.deleteJustification = '';
  }
}
