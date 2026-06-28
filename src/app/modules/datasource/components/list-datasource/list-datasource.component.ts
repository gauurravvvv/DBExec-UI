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
import { DATASOURCE } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { DatasourceService } from '../../services/datasource.service';

/**
 * Datasource listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the BE `/datasources` list call. The
 * page header / content card / delete-confirm popup retain the
 * existing styling and behaviour; only the `<p-table>` was swapped
 * out for the AG Grid wrapper.
 *
 * Datasources ARE the listed entity, so there is no datasource
 * dropdown — the adapter binds unconditionally in `ngOnInit`.
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

  /* ── page state — UNCHANGED from the p-table version ──── */

  selectedDatasources: any[] = [];
  selectedDatasource: any = null;
  showDeleteConfirm = false;
  bulkDelete = false;
  deleteJustification = '';
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  today = new Date();
  statusOptions: any[] = [];

  // Per-row spinner helpers — each row reads its own state.
  isDeleting = (id: string): boolean => this.datasourceService.isDeleting(id);
  get isBulkDeleting(): boolean {
    return this.selectedDatasources.some((d: any) =>
      this.datasourceService.isDeleting(d.id),
    );
  }

  /* ── grid wiring ───────────────────────────────────────── */

  /** AG Grid column definitions — widths preserved from the old
   *  `<p-table>` so the visual layout is unchanged. cellRenderer
   *  templates live in the HTML as `<ng-template usGridCell>`. */
  cols: ColDef[] = [];

  gridConfig: UsDataGridConfig = {
    enableRowSelection: true,
    rowSelectionMode: 'multiple',
    freezeFirstColumn: true,
    enableColumnChooser: true,
    enableAddFilter: false, // BE-driven floating filters
    enableAutoFit: true,
    enableDensityToggle: true,
    enableCsvExport: true,
    enableXlsxExport: true,
    enableRefresh: true,
    enableSavedViews: true,
    gridKey: 'datasources-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 280px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound in `ngOnInit`. Unlike the tab
   *  listing, there is no datasource dropdown gating this. */
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
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.datasourceService.cancelReads();
    this.adapter?.destroy();
  }

  get selectedCount(): number {
    return this.selectedDatasources?.length || 0;
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
        width: 224,
        minWidth: 224,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        pinned: 'left',
      },
      {
        colId: 'description',
        field: 'description',
        headerName: this.translate.instant('COMMON.DESCRIPTION'),
        minWidth: 320,
        flex: 1,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
      {
        colId: 'type',
        field: 'type',
        headerName: this.translate.instant('COMMON.TYPE'),
        width: 144,
        minWidth: 144,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'status',
        field: 'status',
        headerName: this.translate.instant('COMMON.STATUS'),
        width: 144,
        minWidth: 144,
        filter: 'agNumberColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'createdOn',
        field: 'createdOn',
        headerName: this.translate.instant('COMMON.CREATED_ON'),
        width: 192,
        minWidth: 192,
        filter: 'agDateColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'actions',
        headerName: this.translate.instant('COMMON.ACTIONS'),
        width: 112,
        minWidth: 112,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'right',
      },
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
      // Floating-filter cell value → BE filter slice.
      filterBuilders: {
        name: cell => ({ name: (cell as any)?.filter ?? cell }),
        description: cell => ({
          description: (cell as any)?.filter ?? cell,
        }),
        type: cell => ({ type: (cell as any)?.filter ?? cell }),
        status: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined ? {} : { status: v };
        },
        createdOn: cell => {
          // AG Grid date filter shapes: {dateFrom, dateTo, type, filterType}.
          const c = cell as any;
          const out: Record<string, string> = {};
          if (c?.dateFrom) out['createdDateFrom'] = new Date(c.dateFrom).toISOString();
          if (c?.dateTo) {
            const to = new Date(c.dateTo);
            to.setHours(23, 59, 59, 999);
            out['createdDateTo'] = to.toISOString();
          }
          return out;
        },
      },
      initial: { page: 1, limit: 10 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  onSelectionChange(rows: any[]) {
    this.selectedDatasources = rows;
    this.cdr.markForCheck();
  }

  clearFilters() {
    if (!this.adapter) return;
    this.adapter.setFilter({});
    this.adapter.setSort([]);
    this.selectedDatasources = [];
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + bulk-delete — UNCHANGED behaviour ─────────── */

  onAddNewDatasource() {
    this.router.navigate([DATASOURCE.ADD]);
  }

  onEdit(db: any) {
    this.router.navigate([DATASOURCE.edit(db.id)]);
  }

  confirmDelete(datasource: any): void {
    this.selectedDatasource = datasource;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.selectedDatasource = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.selectedDatasource = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  async proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedDatasources.map((d: any) => d.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      try {
        const res: any = await this.datasourceService.bulkDelete(ids, reason);
        if (this.globalService.handleSuccessService(res)) {
          this.selectedDatasources = [];
          this.cdr.markForCheck();
          this.refreshList();
        }
      } finally {
        this.closeDeletePopup();
      }
      return;
    }

    if (this.selectedDatasource) {
      try {
        const response: any = await this.datasourceService.delete(
          this.selectedDatasource.id,
          reason,
        );
        if (this.globalService.handleSuccessService(response)) {
          this.selectedDatasources = this.selectedDatasources.filter(
            (d: any) => d.id !== this.selectedDatasource.id,
          );
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
    this.bulkDelete = false;
    this.deleteJustification = '';
    this.cdr.markForCheck();
  }
}
