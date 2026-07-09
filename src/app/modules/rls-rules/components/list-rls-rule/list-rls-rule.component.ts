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
 * unified list table) driven by a `UsServerListAdapter` on the legacy
 * `rlsRulesService.listRules` call. Infinite scroll (no page controls), a
 * single global search plus on-demand per-column filters (shared inputs), and
 * per-row actions. No bulk selection.
 *
 * RLS is datasource-scoped: the adapter is built only once a datasource is
 * chosen (it needs the id in every request), so the datasource picker is
 * projected into the table's toolbar-left slot. The page header, delete-confirm
 * popup and assignments side panel retain their existing behaviour.
 *
 * PRE-EXISTING SEMANTIC MISMATCH (preserved): the BE list endpoint is
 * dataset-scoped, but this page exposes a datasource selector. Passing
 * `selectedDatasource` as the datasetId has always returned zero matches
 * because dataset ids and datasource ids don't overlap. This migration is a
 * like-for-like renderer swap — the broken BE wiring stays broken until the
 * page is redesigned.
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
    mode: 'scroll', // infinite scroll — no page controls
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

  /** Server-side adapter — bound on first datasource selection so
   *  the table doesn't fire a rules query before a datasource exists. */
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
      { colId: 'datasetName', field: 'dataset.name', header: t('RLS.DATASET'), width: '200px', filter: 'text', sortable: false },
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

  onDatasourceChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
    this.bindAdapter();
  }

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
            if (this.datasources.length > 0) {
              this.selectedDatasource = this.datasources[0].id;
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

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Build the server-side adapter once a datasource has been picked.
   * The legacy BE call (`listRules(datasetId)`) ignores
   * filter/sort/pagination — we pass only the id. The custom-table still
   * drives search/scroll UI client-side over the returned rows.
   *
   * NOTE: `selectedDatasource` is passed as the datasetId on purpose;
   * see the class-level comment about the pre-existing mismatch.
   */
  private bindAdapter() {
    if (!this.selectedDatasource) {
      this.adapter = null;
      return;
    }
    // Tear down any prior adapter so its in-flight call doesn't
    // race the new one's first load.
    this.adapter?.destroy();
    const selectedDatasource = this.selectedDatasource;
    this.adapter = new UsServerListAdapter<any>({
      load: (_params: UsListLoadParams) =>
        this.rlsRulesService.listRules(selectedDatasource),
      unwrap: (res: any) => {
        // BE may return `{ data: { rules: [...], count } }` or the
        // bare array `{ data: [...] }`; mirror the legacy
        // `load()` method's fallback chain.
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
