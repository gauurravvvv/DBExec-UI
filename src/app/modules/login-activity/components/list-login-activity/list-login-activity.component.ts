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
import { TranslateService } from '@ngx-translate/core';
import type { ColDef } from 'ag-grid-community';
import { GlobalService } from 'src/app/core/services/global.service';
import { AuditService } from 'src/app/modules/audit-logs/services/audit.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';

/**
 * Login activity listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the BE `/audit-logs/login-activity`
 * list call. Read-only: no bulk actions, no row actions. The page
 * header (with PDF export + clear-filter buttons) and content card
 * retain the existing styling; only the `<p-table>` was swapped out
 * for the AG Grid wrapper.
 */
@Component({
  selector: 'app-list-login-activity',
  templateUrl: './list-login-activity.component.html',
  styleUrls: ['./list-login-activity.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListLoginActivityComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ────────────────────────────────────────── */

  today = new Date();
  isExporting = false;

  /* ── grid wiring ───────────────────────────────────────── */

  /** AG Grid column definitions — widths preserved from the old
   *  `<p-table>` so the visual layout is unchanged. cellRenderer
   *  templates live in the HTML as `<ng-template usGridCell>`. */
  cols: ColDef[] = [];

  gridConfig: UsDataGridConfig = {
    enableRowSelection: false,
    freezeFirstColumn: true,
    enableColumnChooser: true,
    enableAddFilter: false, // we use the BE-driven floating filters
    enableAutoFit: true,
    enableDensityToggle: true,
    enableCsvExport: true,
    enableXlsxExport: true,
    enableRefresh: true,
    enableSavedViews: true,
    gridKey: 'login-activity-list',
    pageSizeOptions: [25, 50, 100],
    pageSize: 25,
    height: 'calc(100vh - 280px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound synchronously in ngOnInit; no
   *  datasource gate for login activity (org-wide). */
  adapter: UsServerListAdapter<any> | null = null;

  /** Floating-filter → BE filter slice translators. Held on the
   *  component (not just inside the adapter) so the BE-driven PDF
   *  export can rebuild the same filter blob from the live
   *  filterModel snapshot. */
  private readonly filterBuilders: Record<
    string,
    (cell: unknown) => Record<string, unknown>
  > = {
    username: cell => ({ username: (cell as any)?.filter ?? cell }),
    eventType: cell => {
      const v = (cell as any)?.filter ?? cell;
      return v === '' || v === null || v === undefined ? {} : { eventType: v };
    },
    ipAddress: cell => ({ ipAddress: (cell as any)?.filter ?? cell }),
    createdOn: cell => {
      // AG Grid date filter shape: {dateFrom, dateTo, type, filterType}.
      const c = cell as any;
      const out: Record<string, string> = {};
      if (c?.dateFrom) out['dateFrom'] = new Date(c.dateFrom).toISOString();
      if (c?.dateTo) {
        const to = new Date(c.dateTo);
        to.setHours(23, 59, 59, 999);
        out['dateTo'] = to.toISOString();
      }
      return out;
    },
  };

  constructor(
    private auditService: AuditService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.cols = this.buildColumns();
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.auditService.cancelReads();
    this.adapter?.destroy();
  }

  get totalItems(): number {
    return this.adapter ? this.adapter.total() : 0;
  }

  get isFilterActive(): boolean {
    return !!this.adapter && Object.keys(this.adapter.filterModel()).length > 0;
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): ColDef[] {
    return [
      {
        colId: 'username',
        field: 'username',
        headerName: this.translate.instant('COMMON.USERNAME'),
        width: 192,
        minWidth: 192,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        pinned: 'left',
      },
      {
        colId: 'eventType',
        field: 'eventType',
        headerName: this.translate.instant('LOGIN_ACTIVITY.EVENT'),
        width: 176,
        minWidth: 176,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'failureReason',
        field: 'failureReason',
        headerName: this.translate.instant('LOGIN_ACTIVITY.FAILURE_REASON'),
        minWidth: 224,
        flex: 1,
        sortable: false,
        filter: false,
      },
      {
        colId: 'createdOn',
        field: 'createdOn',
        headerName: this.translate.instant('LOGIN_ACTIVITY.TIMESTAMP'),
        width: 224,
        minWidth: 224,
        filter: 'agDateColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'ipAddress',
        field: 'ipAddress',
        headerName: this.translate.instant('LOGIN_ACTIVITY.IP_ADDRESS'),
        width: 160,
        minWidth: 160,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'userAgent',
        field: 'userAgent',
        headerName: this.translate.instant('LOGIN_ACTIVITY.USER_AGENT'),
        minWidth: 256,
        flex: 1,
        sortable: false,
        filter: false,
      },
    ];
  }

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Construct the server-side adapter. Called once from ngOnInit —
   * no datasource gating needed for login activity.
   */
  private bindAdapter() {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.auditService.listLoginActivity({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // Custom unwrap — the BE returns `{ activities: [], count }`.
      unwrap: (res: any) => ({
        rows: res?.data?.activities ?? [],
        total: res?.data?.count ?? 0,
      }),
      // Floating-filter cell value → BE filter slice. Reuse the
      // shared map so the export path can rebuild the same blob.
      filterBuilders: this.filterBuilders,
      initial: { page: 1, limit: 25 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers ────────────────────────────────────────── */

  clearFilters() {
    if (!this.adapter) return;
    this.adapter.setFilter({});
    this.adapter.setSort([]);
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── presentation helpers — preserved from p-table version ── */

  getEventClass(eventType: string): string {
    switch (eventType) {
      case 'LOGIN_SUCCESS':
        return 'event-success';
      case 'LOGIN_FAILED':
        return 'event-failed';
      case 'LOGOUT':
        return 'event-logout';
      case 'TOKEN_REFRESH':
        return 'event-refresh';
      case 'PASSWORD_RESET':
        return 'event-warning';
      default:
        return 'event-default';
    }
  }

  /* ── BE-driven PDF export — preserved ─────────────────── */

  exportActivity(format: 'pdf') {
    // Reuse the live filter model so the export mirrors what the user
    // is seeing. Run each cell through the shared filterBuilders map
    // — same logic the adapter uses to assemble the list-call filter
    // blob — so the BE sees an identical shape on both endpoints.
    const filter: Record<string, unknown> = {};
    const filterModel = this.adapter?.filterModel() ?? {};
    for (const [colId, cell] of Object.entries(filterModel)) {
      if (cell === null || cell === undefined || cell === '') continue;
      const builder = this.filterBuilders[colId];
      Object.assign(filter, builder ? builder(cell) : { [colId]: cell });
    }
    const params: any = { format };
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.isExporting = true;
    this.cdr.markForCheck();
    this.auditService
      .exportLoginActivity(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob: Blob) => {
          const dateStr = new Date().toISOString().slice(0, 10);
          const fileName = `Login_Activity_${dateStr}.pdf`;

          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          window.URL.revokeObjectURL(url);
          this.isExporting = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.globalService.handleSuccessService({
            status: false,
            code: 500,
            message: 'Failed to export login activity',
          });
          this.isExporting = false;
          this.cdr.markForCheck();
        },
      });
  }
}
