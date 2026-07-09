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
import { GlobalService } from 'src/app/core/services/global.service';
import { AuditService } from 'src/app/modules/audit-logs/services/audit.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';

/**
 * Login activity listing — renders through the shared `<app-custom-table>`
 * (the app's unified list table) driven by a `UsServerListAdapter` on the BE
 * `/audit-logs/login-activity` list call. Read-only activity log: infinite
 * scroll (no page controls), a single global search plus on-demand per-column
 * filters (shared inputs). No bulk selection and no row actions — there is
 * nothing to add, edit, or delete.
 *
 * The page header retains its BE-driven PDF export button; per-cell DOM is
 * supplied via `<ng-template usGridCell>` so the visual look — username link,
 * event badge, failure-reason text, relative timestamp, ip / user-agent text —
 * is unchanged.
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

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    mode: 'scroll', // infinite scroll — no page controls
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE login-activity matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'login-activity-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound synchronously in ngOnInit; no datasource
   *  gate for login activity (org-wide). */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private auditService: AuditService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.cols = this.buildColumns();
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'LOGIN_ACTIVITY.SEARCH_PLACEHOLDER',
      ),
    };
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

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'username', field: 'username', header: t('COMMON.USERNAME'), width: '192px', frozen: true, filter: 'text' },
      { colId: 'eventType', field: 'eventType', header: t('LOGIN_ACTIVITY.EVENT'), width: '176px', filter: 'text' },
      { colId: 'failureReason', field: 'failureReason', header: t('LOGIN_ACTIVITY.FAILURE_REASON'), width: '224px', sortable: false },
      { colId: 'createdOn', field: 'createdOn', header: t('LOGIN_ACTIVITY.TIMESTAMP'), width: '224px' },
      { colId: 'ipAddress', field: 'ipAddress', header: t('LOGIN_ACTIVITY.IP_ADDRESS'), width: '160px', filter: 'text' },
      { colId: 'userAgent', field: 'userAgent', header: t('LOGIN_ACTIVITY.USER_AGENT'), width: '256px', sortable: false },
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
      // custom-table sends PLAIN filter values (global `search` + per-column
      // username/eventType/ipAddress), so the adapter's identity mapping
      // passes them straight through — no AG-Grid cell unwrapping needed.
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers ────────────────────────────────────────── */

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
    // is seeing. custom-table stores PLAIN filter values keyed by colId,
    // so the blob is assembled directly — no cell unwrapping needed.
    const filter: Record<string, unknown> = {};
    const filterModel = this.adapter?.filterModel() ?? {};
    for (const [colId, cell] of Object.entries(filterModel)) {
      if (cell === null || cell === undefined || cell === '') continue;
      filter[colId] = cell;
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
