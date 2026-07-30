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
import { PROMPT } from 'src/app/core/constants/routes.constant';
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
import { PromptService } from '../../services/prompt.service';

/**
 * Prompt listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE prompt list
 * call. Infinite scroll (no page controls), a global search plus on-demand
 * per-column filters, and per-row actions. No bulk selection.
 *
 * A prompt list is datasource-scoped, so the screen keeps its datasource
 * dropdown (server-mode) projected into the table's toolbar-left slot. The
 * adapter closes over the selected datasourceId; selecting a datasource
 * rebuilds the adapter so the next load carries the new scope.
 */
@Component({
  selector: 'app-list-prompt',
  templateUrl: './list-prompt.component.html',
  styleUrls: ['./list-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListPromptComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  showDeleteConfirm = false;
  promptToDelete: string | null = null;
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

  saving = this.promptService.saving;

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'name', // prompt list matches a `name` filter for search
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'prompts-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound only once a datasource is selected, and
   *  rebuilt whenever the datasource changes so the closure picks up the
   *  new scope. Null until the first datasource resolves. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private datasourceService: DatasourceService,
    private promptService: PromptService,
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
        if (params['datasourceId'] || params['name']) {
          this.handleDeepLinking(params);
        } else {
          this.loadDatasources();
        }
      });
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.promptService.cancelReads();
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
        colId: 'groupName',
        field: 'groupName',
        header: t('PROMPT_MODULE.GROUP'),
        width: '176px',
        filter: 'text',
      },
      {
        colId: 'type',
        field: 'type',
        header: t('COMMON.TYPE'),
        width: '144px',
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
        width: '160px',
        sortable: false,
      },
    ];
  }

  /* ── deep-linking ────────────────────────────────────── */

  handleDeepLinking(params: any) {
    const datasourceId = params['datasourceId'] ? params['datasourceId'] : null;
    const name = params['name'];

    if (name) {
      this.deepLinkName = name;
    }

    if (datasourceId) {
      this.loadDatasources(datasourceId);
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
            this.datasources = items;
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

  onDBChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
    // The adapter closes over selectedDatasource — rebuild so the next
    // load picks up the new scope.
    this.bindAdapter();
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter() {
    // Tear down any prior adapter so its in-flight call doesn't race the
    // new one's first load.
    this.adapter?.destroy();
    if (!this.selectedDatasource) {
      this.adapter = null;
      this.cdr.markForCheck();
      return;
    }
    const datasourceId = this.selectedDatasource;
    // Seed the deep-link name into the adapter's initial filter (once).
    const name = this.deepLinkName;
    this.deepLinkName = null;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) => {
        // The datasourceId travels as a top-level query param, NOT inside the
        // JSON filter payload — the BE list contract expects it there.
        const req: any = {
          datasourceId,
          page: params.page,
          limit: params.limit,
        };
        if (params.sort) req.sort = params.sort;
        if (params.filter) req.filter = params.filter;
        return this.promptService.listPrompt(req);
      },
      // BE returns `{ data: { prompts: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.prompts ?? [],
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

  onAddNewPrompt() {
    this.router.navigate([PROMPT.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([PROMPT.edit(id)]);
  }

  onConfig(id: string) {
    this.router.navigate([PROMPT.configure(id)]);
  }

  confirmDelete(id: string) {
    this.promptToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.promptToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.promptToDelete) {
      this.promptService
        .delete(this.promptToDelete, reason)
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
    this.promptToDelete = null;
    this.deleteJustification = '';
  }
}
