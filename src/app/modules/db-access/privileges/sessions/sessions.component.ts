import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { GlobalService } from 'src/app/core/services/global.service';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';

interface SessionRow {
  pid: number;
  user: string | null;
  database: string | null;
  clientAddr: string | null;
  applicationName: string | null;
  state: string | null;
  waitEventType: string | null;
  backendStart: string | null;
  xactStart: string | null;
  queryStart: string | null;
  stateChange: string | null;
  backendType: string | null;
  query: string | null;
}

type SessionAction = 'cancel' | 'terminate';

/**
 * SessionsComponent — a live pg_stat_activity viewer for a datasource,
 * reached from the Privileges & Access header ("Active Sessions"). Mirrors
 * the list-user shell: h2 in .page-header-section (no subtitle), a flat
 * .content-card with the shared datasource-picker in the toolbar, then a
 * p-datatable-sm modern-table with a filter row, status pills, and
 * row-actions.
 *
 * FULLY STATELESS: reads pg_stat_activity live and issues
 * pg_cancel_backend / pg_terminate_backend against the target datasource.
 * Nothing is persisted to our DB. Sessions are volatile so the list is
 * fetched fresh on every manual Refresh (no BE caching). The management
 * connection's own backend (selfPid) is flagged "(this session)" and its
 * actions disabled — the BE also refuses to act on its own pid.
 */
@Component({
  selector: 'app-db-sessions',
  templateUrl: './sessions.component.html',
  styleUrls: ['./sessions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionsComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;
  capability = this.ctx.capability;
  capabilityLoading = this.ctx.capabilityLoading;
  unsupported = this.ctx.unsupported;

  datasourceId = '';
  sessions: SessionRow[] = [];
  selfPid = 0;

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */
  cols: CustomTableColumn[] = [];
  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    // Sessions have bespoke toolbar filters (name / state / hide-background)
    // projected into the table's toolbar-start slot, so the table's own global
    // search + per-column filters are off.
    globalSearch: false,
    showColumnFilters: false,
    enableExport: true,
    gridKey: 'db-sessions-list',
    height: 'flex', // fill available height, responsive to screen size
    rowIdField: 'pid',
  };
  // Server-side adapter: the grid page/sort + toolbar search/state/hide-
  // background drive a BE query (filter/sort/slice server-side). See
  // buildAdapter().
  adapter: UsServerListAdapter<any> | null = null;

  // Filters (fed to the server via serverFilter()).
  statusOptions: { label: string; value: string }[] = [];
  filterValues: { name: string; state: string | null; hideBackground: boolean } = {
    name: '',
    state: null,
    hideBackground: true,
  };

  // Confirm popup gate.
  showConfirm = false;
  confirmAction: SessionAction | null = null;
  confirmTarget: SessionRow | null = null;

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  get canManage(): boolean {
    return this.ctx.canManage;
  }

  ngOnInit(): void {
    this.statusOptions = [
      { label: this.translate.instant('DB_ACCESS.SESSION_STATE_ACTIVE'), value: 'active' },
      { label: this.translate.instant('DB_ACCESS.SESSION_STATE_IDLE'), value: 'idle' },
      {
        label: this.translate.instant('DB_ACCESS.SESSION_STATE_IDLE_IN_TXN'),
        value: 'idle in transaction',
      },
    ];
    this.cols = this.buildColumns();
    this.buildAdapter();
  }

  ngOnDestroy(): void {
    this.dbAccess.cancelReads();
    this.adapter?.destroy();
  }

  /** Table columns — widths preserved from the previous grid. Cell DOM is
   *  supplied by `<ng-template usGridCell>` in the HTML. Only the server-
   *  whitelisted keys (pid/user/database/state/queryStart) are sortable. */
  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'pid', field: 'pid', header: t('DB_ACCESS.PID'), width: '112px', frozen: true },
      { colId: 'user', field: 'user', header: t('DB_ACCESS.SESSION_USER'), width: '160px' },
      { colId: 'database', field: 'database', header: t('DB_ACCESS.SESSION_DATABASE'), width: '150px' },
      { colId: 'clientAddr', field: 'clientAddr', header: t('DB_ACCESS.CLIENT_ADDR'), width: '150px', sortable: false },
      { colId: 'applicationName', field: 'applicationName', header: t('DB_ACCESS.APPLICATION'), width: '170px', sortable: false },
      { colId: 'state', field: 'state', header: t('DB_ACCESS.SESSION_STATE'), width: '160px' },
      { colId: 'waitEventType', field: 'waitEventType', header: t('DB_ACCESS.WAIT'), width: '128px', sortable: false },
      { colId: 'query', field: 'query', header: t('DB_ACCESS.QUERY'), width: '320px', sortable: false },
      { colId: 'queryStart', field: 'queryStart', header: t('DB_ACCESS.STARTED'), width: '150px' },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '128px', sortable: false },
    ];
  }

  /**
   * Server-side adapter. Each `load` sends page/limit (+ sort + a JSON filter
   * { search?, state?, backendType? }) to loadSessionsPaged → BE listSessions
   * paged mode (filter/sort/slice server-side). `selfPid` is captured from the
   * paged response so the caller's own row is still flagged. The toolbar
   * search/state/hide-background feed the filter via setFilter(serverFilter()).
   */
  private buildAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: p => {
        if (!this.datasourceId) return Promise.resolve({ rows: [], total: 0 });
        return this.dbAccess
          .loadSessionsPaged(this.datasourceId, {
            page: p.page,
            limit: p.limit,
            sort: p.sort,
            filter: p.filter,
          })
          .then(res => {
            const rows = res?.status ? (res.data?.sessions ?? []) : [];
            this.sessions = rows;
            this.selfPid = res?.data?.selfPid ?? this.selfPid;
            return { rows, total: res?.data?.count ?? rows.length };
          });
      },
      unwrap: (res: any) => ({ rows: res.rows, total: res.total }),
      // AG Grid colId → BE sort key (whitelisted server-side in listSessions).
      sortFieldMap: {
        pid: 'pid',
        user: 'user',
        database: 'database',
        state: 'state',
        queryStart: 'queryStart',
      },
      initial: { page: 1, limit: 10 },
    });
  }

  /** The JSON filter the BE understands ({ search?, state?, backendType? }). */
  private serverFilter(): Record<string, unknown> {
    const f: Record<string, unknown> = {};
    const search = (this.filterValues.name || '').trim();
    if (search) f['search'] = search;
    if (this.filterValues.state) f['state'] = this.filterValues.state;
    // hideBackground → only client backends (BE `backendType` contains filter).
    if (this.filterValues.hideBackground) f['backendType'] = 'client backend';
    return f;
  }

  /** Grid Refresh button → re-fetch the live session list (page 1). */
  refreshList(): void {
    this.refresh();
  }

  /** Emitted by the datasource picker (init hydrate + change). */
  onDatasourceChange(id: string): void {
    this.datasourceId = id || '';
    this.sessions = [];
    this.selfPid = 0;
    this.filterValues = { name: '', state: null, hideBackground: true };
    if (!this.datasourceId) {
      this.adapter?.reload();
      this.cdr.markForCheck();
      return;
    }
    this.refresh();
  }

  refresh(): void {
    if (!this.datasourceId) return;
    // Server-paged: re-fetch page 1 with the current filter.
    this.adapter?.setFilter(this.serverFilter());
  }

  get isFilterActive(): boolean {
    return !!this.filterValues.name || this.filterValues.state !== null || !this.filterValues.hideBackground;
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.filterValues = { name: '', state: null, hideBackground: true };
    this.applyFilters();
  }

  private applyFilters(): void {
    // Server-paged: push the merged toolbar filter to the BE (page 1).
    this.adapter?.setFilter(this.serverFilter());
    this.cdr.markForCheck();
  }

  isClientBackend(s: SessionRow): boolean {
    return (s.backendType || 'client backend') === 'client backend';
  }

  isSelf(s: SessionRow): boolean {
    return this.selfPid > 0 && s.pid === this.selfPid;
  }

  /** Normalise pg state into the pill classes we style (active/idle/expired-like). */
  stateClass(s: SessionRow): string {
    const st = (s.state || '').toLowerCase();
    if (st === 'active') return 'active';
    if (st === 'idle in transaction' || st === 'idle in transaction (aborted)') return 'expired';
    if (st === 'idle') return 'no-login';
    return 'inactive';
  }

  /** Map the pg session state to an app-chip semantic tone. */
  stateTone(s: SessionRow): 'success' | 'error' | 'neutral' {
    switch (this.stateClass(s)) {
      case 'active':
        return 'success';
      case 'expired':
        return 'error';
      default:
        return 'neutral';
    }
  }

  stateLabel(s: SessionRow): string {
    return s.state || this.translate.instant('DB_ACCESS.SESSION_STATE_UNKNOWN');
  }

  // ── Row actions → confirm popup ─────────────────────────────────────────
  askCancel(s: SessionRow): void {
    this.openConfirm('cancel', s);
  }

  askTerminate(s: SessionRow): void {
    this.openConfirm('terminate', s);
  }

  private openConfirm(action: SessionAction, s: SessionRow): void {
    this.confirmAction = action;
    this.confirmTarget = s;
    this.showConfirm = true;
    this.cdr.markForCheck();
  }

  get confirmIsDestructive(): boolean {
    return this.confirmAction === 'terminate';
  }

  get confirmMessage(): string {
    if (!this.confirmTarget) return '';
    const params = { pid: this.confirmTarget.pid, user: this.confirmTarget.user || '—' };
    return this.confirmAction === 'terminate'
      ? this.translate.instant('DB_ACCESS.CONFIRM_TERMINATE_BODY', params)
      : this.translate.instant('DB_ACCESS.CONFIRM_CANCEL_BODY', params);
  }

  get confirmTitle(): string {
    return this.confirmAction === 'terminate'
      ? this.translate.instant('DB_ACCESS.TERMINATE_SESSION')
      : this.translate.instant('DB_ACCESS.CANCEL_QUERY');
  }

  confirm(): void {
    if (!this.confirmTarget || !this.confirmAction) return;
    const pid = this.confirmTarget.pid;
    const op =
      this.confirmAction === 'terminate'
        ? this.dbAccess.terminateSession(this.datasourceId, pid)
        : this.dbAccess.cancelSession(this.datasourceId, pid);
    op.then(res => {
      if (this.globalService.handleSuccessService(res)) {
        this.showConfirm = false;
        this.confirmTarget = null;
        this.confirmAction = null;
        this.refresh();
      }
    })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  cancelConfirm(): void {
    this.showConfirm = false;
    this.confirmTarget = null;
    this.confirmAction = null;
  }
}
