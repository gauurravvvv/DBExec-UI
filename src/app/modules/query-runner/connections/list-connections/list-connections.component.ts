import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import type { ColDef } from 'ag-grid-community';
import { QUERY_RUNNER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import {
  QueryConnection,
  QueryRunnerService,
} from '../../services/query-runner.service';

/**
 * ListConnectionsComponent — the caller's private Query Runner
 * connection profiles. Same list-user shell (h2 above a flat card,
 * modern p-table, filter row, row actions, paginator refresh). Each row
 * is a datasource + a DB login the user was given; opening one in the
 * launcher runs SQL as that login.
 */
@Component({
  selector: 'app-list-connections',
  templateUrl: './list-connections.component.html',
  styleUrls: ['./list-connections.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListConnectionsComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  loading = false;
  connections: QueryConnection[] = [];
  filterName = '';

  /* ── us-data-grid wiring (identical pattern to list-db-roles) ───────── */
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
    gridKey: 'connections-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 280px)',
    rowIdField: 'id',
  };
  // Server-side adapter: the grid's page/sort/column-filters drive a BE
  // query (LIMIT/OFFSET + WHERE + COUNT). See buildAdapter().
  adapter: UsServerListAdapter<any> | null = null;

  testingId: string | null = null;

  // Delete confirm
  showDeleteConfirm = false;
  toDelete: QueryConnection | null = null;
  deleting = false;

  constructor(
    private service: QueryRunnerService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cols = this.buildColumns();
    this.buildAdapter();
    this.adapter?.reload();
  }

  ngOnDestroy(): void {
    this.adapter?.destroy();
  }

  /** AG Grid columns — widths preserved from the previous p-table. Cell
   *  DOM is supplied by `<ng-template usGridCell>` in the HTML. */
  private buildColumns(): ColDef[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', headerName: t('COMMON.NAME'), minWidth: 224, flex: 1, filter: 'agTextColumnFilter', filterParams: { buttons: ['reset'], suppressAndOrCondition: true }, pinned: 'left' },
      { colId: 'datasource', field: 'datasourceName', headerName: t('COMMON.DATASOURCE'), minWidth: 192 },
      { colId: 'login', field: 'username', headerName: t('QUERY_RUNNER.LOGIN'), width: 160, minWidth: 160 },
      { colId: 'health', field: 'lastTestStatus', headerName: t('QUERY_RUNNER.HEALTH'), width: 128, minWidth: 128 },
      { colId: 'state', field: 'enabled', headerName: t('QUERY_RUNNER.STATE'), width: 112, minWidth: 112 },
      { colId: 'actions', headerName: t('COMMON.ACTIONS'), width: 240, minWidth: 240, sortable: false, filter: false, resizable: false, pinned: 'right' },
    ];
  }

  /**
   * Server-side adapter. Each `load` sends page/limit/sort/filter to
   * `listConnections(...)` which pages + column-filters server-side and
   * returns `{ count, connections }`. `sortFieldMap` whitelists AG Grid
   * colIds → BE sort keys; `filterBuilders` turn per-column cell values into
   * BE filter slices. The toolbar name box feeds the same `name` slice via
   * patchFilter (below).
   */
  private buildAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: p =>
        this.service
          .listConnections(undefined, {
            page: p.page,
            limit: p.limit,
            sort: p.sort,
            filter: p.filter,
          })
          .then(res => {
            const rows = res?.status ? (res.data?.connections ?? []) : [];
            this.connections = rows; // keep for any template refs
            return { rows, total: res?.data?.count ?? res?.data?.total ?? rows.length };
          }),
      unwrap: (res: any) => ({ rows: res.rows, total: res.total }),
      sortFieldMap: {
        name: 'name',
        login: 'username',
        state: 'enabled',
        health: 'lastTestStatus',
      },
      filterBuilders: {
        // AG Grid text filter on the Name column → BE `name` ILIKE slice.
        name: (v: any) => {
          const val = typeof v === 'string' ? v : v?.filter;
          return val ? { name: String(val) } : {};
        },
        login: (v: any) => {
          const val = typeof v === 'string' ? v : v?.filter;
          return val ? { username: String(val) } : {};
        },
      },
      initial: { page: 1, limit: 10 },
    });
  }

  /** Grid Refresh button → re-run the current page/filter query. */
  refreshList(): void {
    this.adapter?.reload();
  }

  /** Toolbar name box → inject a server-side `name` filter slice. */
  onFilterChange(): void {
    const q = this.filterName.trim();
    this.adapter?.patchFilter({ name: q || undefined });
  }

  clearFilters(): void {
    this.filterName = '';
    this.adapter?.patchFilter({ name: undefined });
    this.cdr.markForCheck();
  }

  get isFilterActive(): boolean {
    return !!this.filterName.trim();
  }

  onAdd(): void {
    this.router.navigate([QUERY_RUNNER.connectionNew()]);
  }

  onEdit(c: QueryConnection): void {
    this.router.navigate([QUERY_RUNNER.connectionEdit(c.id)]);
  }

  /** Verify the stored credentials against the datasource host. */
  onTest(c: QueryConnection): void {
    if (this.testingId) return;
    this.testingId = c.id;
    this.cdr.markForCheck();
    this.service
      .testConnection(c.id)
      .then(res => {
        // Reflect the new health on the row without a full reload.
        c.lastTestStatus = res?.data?.isConnected ? 'success' : 'failure';
        c.lastTestedAt = res?.data?.lastTestedAt ?? new Date().toISOString();
        // Push the mutated row into the grid so its Health pill updates.
        this.adapter?.reload();
        this.globalService.handleSuccessService(res);
      })
      .catch(() => {})
      .finally(() => {
        this.testingId = null;
        this.cdr.markForCheck();
      });
  }

  /** Open this connection in the standalone executor browser tab. */
  onOpen(c: QueryConnection): void {
    if (c.enabled === false) return; // guarded in template too
    const url = `${QUERY_RUNNER.EXEC}?conn=${encodeURIComponent(c.id)}`;
    window.open(url, '_blank');
  }

  busyId: string | null = null;

  /** Star this connection as the default for its datasource. */
  onSetDefault(c: QueryConnection): void {
    if (this.busyId || c.isDefault || c.enabled === false) return;
    this.busyId = c.id;
    this.cdr.markForCheck();
    this.service
      .setDefault(c.id)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          // Server-paged: re-pull the current page to reflect the new ★.
          this.adapter?.reload();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.busyId = null;
        this.cdr.markForCheck();
      });
  }

  /** Enable / disable a connection. */
  onToggleEnabled(c: QueryConnection): void {
    if (this.busyId) return;
    const next = !(c.enabled !== false);
    this.busyId = c.id;
    this.cdr.markForCheck();
    this.service
      .setEnabled(c.id, next)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          // Server-paged: re-pull so enabled + any promoted default show.
          this.adapter?.reload();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.busyId = null;
        this.cdr.markForCheck();
      });
  }

  confirmDelete(c: QueryConnection): void {
    this.toDelete = c;
    this.showDeleteConfirm = true;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.toDelete = null;
    this.cdr.markForCheck();
  }

  proceedDelete(): void {
    if (!this.toDelete) return;
    this.deleting = true;
    this.cdr.markForCheck();
    const id = this.toDelete.id;
    this.service
      .deleteConnection(id)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          // Server-paged: re-pull so the removal + any promoted default show.
          this.adapter?.reload();
          this.cancelDelete();
        }
      })
      .catch(() => {})
      .finally(() => {
        this.deleting = false;
        this.cdr.markForCheck();
      });
  }
}
