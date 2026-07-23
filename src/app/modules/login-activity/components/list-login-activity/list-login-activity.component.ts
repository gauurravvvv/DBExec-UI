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
import {
  EVENT_FALLBACK,
  EVENT_FILTER_OPTIONS,
  EVENT_META,
} from '../../login-activity-meta.constant';
import { ChainVerifyResult } from 'src/app/modules/audit-logs/models/audit-log.model';
import { LoginActivity } from '../../models/login-activity.model';

interface FilterOption {
  value: string;
  label: string;
}

/**
 * Login-activity listing — the auth-event trail, rendered through the shared
 * `<app-custom-table>` driven by a `UsServerListAdapter` on the BE
 * `/audit-logs/login-activity` list call. Same polish as the audit list:
 * event badge, actor avatar, outcome + origin columns, a filter toolbar
 * (event dropdown, actor search, daterange, failures-only toggle, export),
 * and a right-side detail drawer opened by clicking a row.
 *
 * NAMES ONLY — the BE `mapLoginActivityRow` already drops internal ids;
 * `username` renders with an "Unknown user" fallback. Read-only (nothing to
 * add / edit / delete).
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

  today = new Date();
  isExporting = false;
  totalCount = 0;

  /* ── tamper-evidence (hash chain) ─────────────────────── */

  integrity: ChainVerifyResult | null = null;
  integrityChecking = false;

  /* ── filter model ─────────────────────────────────────── */

  selectedEvent: string | null = null;
  actorSearch = '';
  dateRange: Date[] | null = null;
  failuresOnly = false;
  eventOptions: FilterOption[] = [];

  /* ── drawer state ─────────────────────────────────────── */

  drawerVisible = false;
  selectedLog: LoginActivity | null = null;

  /* ── custom-table wiring ──────────────────────────────── */

  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'search',
    globalSearchPlaceholder: undefined,
    showColumnFilters: false,
    enableExport: false,
    gridKey: 'login-activity-list',
    height: 'flex',
    rowIdField: 'id',
  };

  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private auditService: AuditService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.cols = this.buildColumns();
    this.eventOptions = EVENT_FILTER_OPTIONS.map(o => ({
      value: o.value,
      label: this.translate.instant(o.labelKey),
    }));
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'LOGIN_ACTIVITY.SEARCH_PLACEHOLDER',
      ),
    };
    this.bindAdapter();
    this.verifyIntegrity();
  }

  ngOnDestroy() {
    this.auditService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── columns ──────────────────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        colId: 'event',
        field: 'eventType',
        header: t('LOGIN_ACTIVITY.EVENT'),
        width: '224px',
        frozen: true,
        sortable: false,
      },
      {
        colId: 'actor',
        field: 'username',
        header: t('COMMON.USERNAME'),
        width: '208px',
        sortable: false,
      },
      {
        colId: 'reason',
        field: 'failureReason',
        header: t('LOGIN_ACTIVITY.FAILURE_REASON'),
        width: '224px',
        sortable: false,
      },
      {
        colId: 'when',
        field: 'createdOn',
        header: t('LOGIN_ACTIVITY.TIMESTAMP'),
        width: '188px',
      },
      {
        colId: 'origin',
        field: 'ipAddress',
        header: t('LOGIN_ACTIVITY.IP_ADDRESS'),
        width: '140px',
        sortable: false,
      },
      {
        colId: 'outcome',
        field: 'success',
        header: t('AUDIT.OUTCOME'),
        width: '132px',
        sortable: false,
      },
    ];
  }

  /* ── cell presentation helpers ────────────────────────── */

  eventIcon(eventType: string | null | undefined): string {
    return (eventType && EVENT_META[eventType]?.icon) || EVENT_FALLBACK.icon;
  }

  eventClass(eventType: string | null | undefined): string {
    return (
      (eventType && EVENT_META[eventType]?.cssClass) || EVENT_FALLBACK.cssClass
    );
  }

  eventLabel(eventType: string | null | undefined): string {
    const key =
      (eventType && EVENT_META[eventType]?.labelKey) || EVENT_FALLBACK.labelKey;
    return this.translate.instant(key);
  }

  actorDisplay(log: LoginActivity): string {
    return (
      log.username?.trim() ||
      this.translate.instant('LOGIN_ACTIVITY.UNKNOWN_USER')
    );
  }

  initials(log: LoginActivity): string {
    const name = log.username?.trim();
    if (!name) return '?';
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  /* ── adapter wiring ───────────────────────────────────── */

  private buildFilter(): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (this.selectedEvent) filter['eventType'] = this.selectedEvent;
    if (this.actorSearch.trim()) filter['username'] = this.actorSearch.trim();
    if (this.failuresOnly) filter['outcome'] = 'failure';
    if (this.dateRange && this.dateRange.length) {
      const [from, to] = this.dateRange;
      if (from) filter['dateFrom'] = this.toIso(from, false);
      if (to) filter['dateTo'] = this.toIso(to, true);
    }
    return filter;
  }

  private toIso(d: Date, endOfDay: boolean): string {
    const x = new Date(d);
    if (endOfDay) x.setHours(23, 59, 59, 999);
    else x.setHours(0, 0, 0, 0);
    return x.toISOString();
  }

  private bindAdapter() {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) => {
        let tableFilter: Record<string, unknown> = {};
        if (params.filter) {
          try {
            tableFilter = JSON.parse(params.filter);
          } catch {
            tableFilter = {};
          }
        }
        const merged = { ...this.buildFilter(), ...tableFilter };
        const req: Record<string, unknown> = {
          page: params.page,
          limit: params.limit,
        };
        if (params.sort) req['sort'] = params.sort;
        if (Object.keys(merged).length) req['filter'] = JSON.stringify(merged);
        return this.auditService.listLoginActivity(req);
      },
      unwrap: (res: any) => {
        const rows = (res?.data?.activities ?? []) as LoginActivity[];
        const total = res?.data?.count ?? 0;
        this.totalCount = total;
        Promise.resolve().then(() => this.cdr.markForCheck());
        return { rows, total };
      },
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  private applyFilter(): void {
    this.bindAdapter();
  }

  get totalItems(): number {
    return this.adapter ? this.adapter.total() : 0;
  }

  /* ── toolbar handlers ─────────────────────────────────── */

  onEventChange(value: string | null): void {
    this.selectedEvent = value;
    this.applyFilter();
  }

  onActorSearch(value: string): void {
    this.actorSearch = value ?? '';
    this.applyFilter();
  }

  onDateRangeChange(range: Date[] | null): void {
    this.dateRange = range;
    if (
      !range ||
      range.length === 0 ||
      (range[0] && range[1]) ||
      range[0] === null
    ) {
      this.applyFilter();
    }
  }

  onFailuresToggle(evt: { checked: boolean }): void {
    this.failuresOnly = !!evt?.checked;
    this.applyFilter();
  }

  clearFilters(): void {
    this.selectedEvent = null;
    this.actorSearch = '';
    this.dateRange = null;
    this.failuresOnly = false;
    this.applyFilter();
  }

  get hasActiveFilters(): boolean {
    return (
      !!this.selectedEvent ||
      !!this.actorSearch.trim() ||
      !!(this.dateRange && this.dateRange.length) ||
      this.failuresOnly
    );
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── tamper-evidence badge ────────────────────────────── */

  /** Verify the org's login-activity hash chain and drive the badge. */
  verifyIntegrity(): void {
    this.integrityChecking = true;
    this.integrity = null;
    this.cdr.markForCheck();
    this.auditService
      .verifyLoginActivityChain()
      .then(res => {
        this.integrity = res;
      })
      .catch(() => {
        this.integrity = null;
      })
      .finally(() => {
        this.integrityChecking = false;
        this.cdr.markForCheck();
      });
  }

  /* ── drawer ───────────────────────────────────────────── */

  openDetail(log: LoginActivity): void {
    this.selectedLog = log;
    this.drawerVisible = true;
    this.cdr.markForCheck();

    if (log?.id) {
      this.auditService
        .getLoginActivity(log.id)
        .then(full => {
          if (full && this.drawerVisible && this.selectedLog?.id === full.id) {
            this.selectedLog = full;
            this.cdr.markForCheck();
          }
        })
        .catch(() => {
          /* keep the list row already shown; interceptor toasts errors */
        });
    }
  }

  onDrawerClosed(): void {
    this.drawerVisible = false;
    this.selectedLog = null;
    this.cdr.markForCheck();
  }

  /* ── export ───────────────────────────────────────────── */

  exportActivity(format: 'pdf') {
    const filter = this.buildFilter();
    const params: Record<string, unknown> = { format };
    if (Object.keys(filter).length > 0)
      params['filter'] = JSON.stringify(filter);

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
            message: this.translate.instant('LOGIN_ACTIVITY.EXPORT_FAILED'),
          });
          this.isExporting = false;
          this.cdr.markForCheck();
        },
      });
  }
}
