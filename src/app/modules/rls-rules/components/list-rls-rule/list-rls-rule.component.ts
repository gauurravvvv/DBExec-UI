import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { RLS_RULE } from 'src/app/core/constants/routes.constant';
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
import { RlsRulesService } from '../../services/rls-rules.service';

/**
 * RLS-rule listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the
 * `rlsRulesService.listAllRules` call (`GET /rls-rules`). Infinite scroll (no
 * page controls), a single global search plus on-demand per-column filters
 * (shared inputs), and per-row actions. No bulk selection.
 *
 * There is NO datasource gate — the adapter is built once in `ngOnInit` and
 * browses ALL org rules. Each row is enriched by the BE with `datasetName` +
 * `datasourceName`, so the list shows BOTH the dataset and the datasource
 * context (RLS is the one module where both are meaningful: a rule targets a
 * dataset within a datasource). A datasource picker is projected into the
 * table's toolbar-left slot as an OPTIONAL filter (mirrors list-dataset): with
 * none picked the list shows all rules; picking one re-queries scoped to that
 * datasource. The page header, delete-confirm popup and assignments side panel
 * retain their existing behaviour.
 */
@Component({
  selector: 'app-list-rls-rule',
  templateUrl: './list-rls-rule.component.html',
  styleUrls: ['./list-rls-rule.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListRlsRuleComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  /* ── page state — preserved from the p-table version ──── */

  showDeleteConfirm = false;
  ruleToDelete: string | null = null;
  deleteJustification = '';

  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedDatasource: any = null;

  activeRuleForAssignment: any = null;
  showAssignmentsPanel = false;

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE rules list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'rls-rules-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — built once in ngOnInit; NO datasource gate. The
   *  list browses ALL org rules; the optional toolbar datasource filter narrows
   *  it via a `?datasourceId=` query param. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private rlsRulesService: RlsRulesService,
    private datasourceService: DatasourceService,
    private router: Router,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.cols = this.buildColumns();
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant('RLS.SEARCH_PLACEHOLDER'),
    };
    // Build the datasource-free adapter once — the list browses ALL org rules.
    // The optional toolbar datasource filter narrows it via a `?datasourceId=`
    // query param (no gate).
    this.bindAdapter();
    // Preload datasources purely to populate the optional filter dropdown.
    this.loadDatasources();
  }

  ngOnDestroy() {
    this.rlsRulesService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '240px', frozen: true, filter: 'text' },
      { colId: 'datasourceName', field: 'datasourceName', header: t('COMMON.DATASOURCE'), width: '192px', filter: 'text', sortable: false },
      { colId: 'datasetName', field: 'datasetName', header: t('RLS.DATASET'), width: '200px', filter: 'text', sortable: false },
      { colId: 'conditions', field: 'conditions', header: t('RLS.CONDITIONS'), width: '360px', sortable: false },
      { colId: 'status', field: 'status', header: t('COMMON.STATUS'), width: '144px' },
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

  /** Datasource filter changed — rebuild the adapter so the list re-queries
   *  scoped to (or cleared of) the selected datasource. Mirrors list-dataset. */
  onDatasourceChange(): void {
    this.bindAdapter();
  }

  /**
   * Preload the org's datasources purely to populate the OPTIONAL toolbar
   * filter dropdown. No longer gates or binds the list adapter: the list shows
   * all rules regardless of datasource.
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

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Construct the server-side adapter. NO datasource gate — the list browses
   * ALL org rules via `GET /rls-rules`. A `datasourceId` query param is sent
   * only when the optional toolbar filter has one selected, narrowing the rows
   * to that datasource server-side.
   */
  private bindAdapter() {
    // Tear down any prior adapter so its in-flight call doesn't
    // race the new one's first load.
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.rlsRulesService.listAllRules({
          ...(this.selectedDatasource
            ? { datasourceId: this.selectedDatasource }
            : {}),
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      unwrap: (res: any) => {
        // BE may return `{ data: { rules: [...], count } }` or the
        // bare array `{ data: [...] }`; mirror the legacy fallback chain.
        const arr = Array.isArray(res?.data)
          ? res.data
          : (res?.data?.rules ?? []);
        return { rows: arr, total: res?.data?.count ?? arr.length };
      },
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  refreshList() {
    this.adapter?.reload();
  }

  trackByIndex(index: number): number {
    return index;
  }

  /* ── assignments side panel — preserved ──────────────── */

  onManageAssignments(rule: any) {
    this.activeRuleForAssignment = rule;
    this.showAssignmentsPanel = true;
  }

  onAssignmentsPanelClose() {
    this.showAssignmentsPanel = false;
    this.activeRuleForAssignment = null;
  }

  /* ── nav + delete — preserved ────────────────────────── */

  onAddNewRule() {
    this.router.navigate([RLS_RULE.ADD]);
  }

  onEdit(rule: any) {
    this.router.navigate([RLS_RULE.edit(rule.id)]);
  }

  confirmDelete(id: string) {
    this.ruleToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.ruleToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!this.ruleToDelete || !reason) return;

    this.rlsRulesService
      .delete(this.ruleToDelete, reason)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.refreshList();
        }
      })
      .catch(() => {
        /* global interceptor shows error toast */
      })
      .finally(() => {
        this.showDeleteConfirm = false;
        this.ruleToDelete = null;
        this.deleteJustification = '';
        this.cdr.markForCheck();
      });
  }
}
