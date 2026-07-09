import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DATASOURCE } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { DatasourceService } from '../../services/datasource.service';

/**
 * Datasource listing — renders through the shared `<app-custom-table>` (the
 * app's unified list table) driven by a `UsServerListAdapter` on the BE
 * `/datasources` list call. Infinite scroll (no page controls), a single
 * global search plus on-demand per-column filters (shared inputs), and
 * per-row actions. No bulk selection.
 *
 * Datasources ARE the listed entity so there is no datasource gate — the
 * adapter binds unconditionally in `ngOnInit`. Org-wide list; no secondary
 * filter dropdown, so nothing is projected into the toolbar's left slot.
 */
@Component({
  selector: 'app-list-datasource',
  templateUrl: './list-datasource.component.html',
  styleUrls: ['./list-datasource.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDatasourceComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  selectedDatasource: any = null;
  showDeleteConfirm = false;
  deleteJustification = '';
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  today = new Date();
  statusOptions: any[] = [];

  // Per-row spinner helper — each row reads its own state.
  isDeleting = (id: string): boolean => this.datasourceService.isDeleting(id);

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    mode: 'scroll', // infinite scroll — no page controls
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE datasources list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'datasources-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound in `ngOnInit`. Datasources are the listed
   *  entity so there is no datasource gate. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private datasourceService: DatasourceService,
    private router: Router,
    private globalService: GlobalService,
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
        'DATASOURCE.SEARCH_PLACEHOLDER',
      ),
    };
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.datasourceService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text' },
      { colId: 'description', field: 'description', header: t('COMMON.DESCRIPTION'), width: '320px', filter: 'text', sortable: false },
      { colId: 'type', field: 'type', header: t('COMMON.TYPE'), width: '144px', filter: 'text' },
      { colId: 'status', field: 'status', header: t('COMMON.STATUS'), width: '144px' },
      { colId: 'createdOn', field: 'createdOn', header: t('COMMON.CREATED_ON'), width: '192px' },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '144px', sortable: false },
    ];
  }

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Construct the server-side adapter. Datasources are the listed
   * entity so the adapter binds eagerly — no datasourceId close-over
   * required.
   */
  private bindAdapter() {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.datasourceService.listDatasource({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { datasources: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.datasources ?? [],
        total: res?.data?.count ?? 0,
      }),
      // custom-table sends PLAIN filter values (global `search` + per-column
      // name/description/type/status), so the adapter's identity mapping
      // passes them straight through — no AG-Grid cell unwrapping needed.
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + per-row delete ────────────────────────────── */

  onAddNewDatasource() {
    this.router.navigate([DATASOURCE.ADD]);
  }

  onEdit(db: any) {
    this.router.navigate([DATASOURCE.edit(db.id)]);
  }

  confirmDelete(datasource: any): void {
    this.selectedDatasource = datasource;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.selectedDatasource = null;
    this.deleteJustification = '';
  }

  async proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.selectedDatasource) {
      try {
        const response: any = await this.datasourceService.delete(
          this.selectedDatasource.id,
          reason,
        );
        if (this.globalService.handleSuccessService(response)) {
          this.cdr.markForCheck();
          this.refreshList();
        }
      } finally {
        this.closeDeletePopup();
      }
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.selectedDatasource = null;
    this.deleteJustification = '';
    this.cdr.markForCheck();
  }
}
