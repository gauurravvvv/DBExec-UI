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
import { QUERY_RUNNER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
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

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; the single `name` column carries the on-demand text filter. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    mode: 'scroll', // infinite scroll — no page controls
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE connections list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    enableDensity: true,
    density: 'comfortable',
    gridKey: 'connections-list',
    height: 'flex',
    rowIdField: 'id',
  };
  // Server-side adapter: the table's page/sort/global-search drive a BE
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
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'QUERY_RUNNER.CONNECTIONS_SEARCH_PLACEHOLDER',
      ),
    };
    this.buildAdapter();
    this.adapter?.reload();
  }

  ngOnDestroy(): void {
    this.adapter?.destroy();
  }

  /** Unified-table columns — widths carried over from the AG-Grid ColDefs.
   *  Cell DOM is supplied by `<ng-template usGridCell>` in the HTML. */
  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text' },
      { colId: 'datasource', field: 'datasourceName', header: t('COMMON.DATASOURCE'), width: '192px' },
      { colId: 'login', field: 'username', header: t('QUERY_RUNNER.LOGIN'), width: '160px' },
      { colId: 'health', field: 'lastTestStatus', header: t('QUERY_RUNNER.HEALTH'), width: '128px', sortable: false },
      { colId: 'state', field: 'enabled', header: t('QUERY_RUNNER.STATE'), width: '112px', sortable: false },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '144px', sortable: false },
    ];
  }

  /**
   * Server-side adapter. Each `load` sends page/limit/sort/filter to
   * `listConnections(...)` which pages + filters server-side and returns
   * `{ count, connections }`. `sortFieldMap` whitelists the table colIds →
   * BE sort keys. custom-table sends PLAIN filter values (the global `search`
   * key + per-column `name`), so the adapter passes them straight through —
   * no AG-Grid cell unwrapping needed.
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
      initial: { page: 1, limit: 50 },
    });
  }

  /** Table Refresh button → re-run the current page/filter query. */
  refreshList(): void {
    this.adapter?.reload();
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
