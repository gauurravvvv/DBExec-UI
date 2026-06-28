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
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import type { ColDef } from 'ag-grid-community';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { RLS_RULE } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { RlsRulesService } from '../../services/rls-rules.service';

/**
 * RLS-rule listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the legacy `rlsRulesService.listRules`
 * call. The page header / datasource dropdown / delete-confirm popup /
 * assignments side panel retain the existing styling and behaviour;
 * only the `<p-table>` was swapped out for the AG Grid wrapper.
 *
 * PRE-EXISTING SEMANTIC MISMATCH (preserved): the BE list endpoint is
 * dataset-scoped, but this page exposes a datasource selector. Passing
 * `selectedDatasource` as the datasetId has always returned zero
 * matches because dataset ids and datasource ids don't overlap. This
 * migration is a like-for-like renderer swap — the broken BE wiring
 * stays broken until the page is redesigned.
 */
@Component({
  selector: 'app-list-rls-rule',
  templateUrl: './list-rls-rule.component.html',
  styleUrls: ['./list-rls-rule.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListRlsRuleComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
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

  /* ── grid wiring ───────────────────────────────────────── */

  cols: ColDef[] = [];

  gridConfig: UsDataGridConfig = {
    enableRowSelection: false,
    freezeFirstColumn: true,
    enableColumnChooser: true,
    enableAddFilter: false,
    enableAutoFit: true,
    enableDensityToggle: true,
    enableCsvExport: true,
    enableXlsxExport: true,
    enableRefresh: true,
    enableSavedViews: true,
    gridKey: 'rls-rules-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 340px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound on first datasource selection. */
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
    this.loadDatasources();
  }

  ngOnDestroy() {
    this.rlsRulesService.cancelReads();
    this.adapter?.destroy();
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
        width: 240,
        minWidth: 224,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        pinned: 'left',
      },
      {
        colId: 'datasetName',
        field: 'dataset.name',
        headerName: this.translate.instant('RLS.DATASET'),
        width: 200,
        minWidth: 180,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
      {
        colId: 'conditions',
        field: 'conditions',
        headerName: this.translate.instant('RLS.CONDITIONS'),
        minWidth: 360,
        flex: 1,
        sortable: false,
        filter: false,
      },
      {
        colId: 'status',
        field: 'status',
        headerName: this.translate.instant('COMMON.STATUS'),
        width: 144,
        minWidth: 128,
        filter: 'agNumberColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'actions',
        headerName: this.translate.instant('COMMON.ACTIONS'),
        width: 176,
        minWidth: 176,
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
   * filter/sort/pagination — we pass only the id. The adapter still
   * drives the paginator UI client-side over the returned rows.
   *
   * NOTE: `selectedDatasource` is passed as the datasetId on purpose;
   * see the class-level comment about the pre-existing mismatch.
   */
  private bindAdapter() {
    if (!this.selectedDatasource) {
      this.adapter = null;
      return;
    }
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
      initial: { page: 1, limit: 10 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  clearFilters() {
    if (!this.adapter) return;
    this.adapter.setFilter({});
    this.adapter.setSort([]);
  }

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
