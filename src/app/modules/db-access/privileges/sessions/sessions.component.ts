import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import type { ColDef } from 'ag-grid-community';
import { GlobalService } from 'src/app/core/services/global.service';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
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
  private allSessions: SessionRow[] = [];
  sessions: SessionRow[] = [];
  selfPid = 0;

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
    gridKey: 'db-sessions-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 280px)',
    rowIdField: 'pid',
  };
  // Client-side adapter: loadSessions returns the full array; `load` hands
  // the grid the name/state/hideBackground-filtered rows applyFilters()
  // already computes.
  adapter: UsServerListAdapter<any> | null = null;

  // Filters (client-side).
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

  /** AG Grid columns — widths preserved from the previous p-table. Cell
   *  DOM is supplied by `<ng-template usGridCell>` in the HTML. */
  private buildColumns(): ColDef[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'pid', field: 'pid', headerName: t('DB_ACCESS.PID'), width: 112, minWidth: 112, filter: 'agNumberColumnFilter', filterParams: { buttons: ['reset'], suppressAndOrCondition: true }, pinned: 'left' },
      { colId: 'user', field: 'user', headerName: t('DB_ACCESS.SESSION_USER'), minWidth: 160 },
      { colId: 'database', field: 'database', headerName: t('DB_ACCESS.SESSION_DATABASE'), minWidth: 144 },
      { colId: 'clientAddr', field: 'clientAddr', headerName: t('DB_ACCESS.CLIENT_ADDR'), minWidth: 144 },
      { colId: 'applicationName', field: 'applicationName', headerName: t('DB_ACCESS.APPLICATION'), minWidth: 160 },
      { colId: 'state', field: 'state', headerName: t('DB_ACCESS.SESSION_STATE'), width: 160, minWidth: 160 },
      { colId: 'waitEventType', field: 'waitEventType', headerName: t('DB_ACCESS.WAIT'), width: 128, minWidth: 128 },
      { colId: 'query', field: 'query', headerName: t('DB_ACCESS.QUERY'), minWidth: 288, flex: 1 },
      { colId: 'queryStart', field: 'queryStart', headerName: t('DB_ACCESS.STARTED'), width: 144, minWidth: 144 },
      { colId: 'actions', headerName: t('COMMON.ACTIONS'), width: 144, minWidth: 144, sortable: false, filter: false, resizable: false, pinned: 'right' },
    ];
  }

  /** Client-side adapter — its `load` hands the grid the already
   *  filtered rows the component computes in applyFilters(). */
  private buildAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: () => Promise.resolve({ rows: this.sessions, total: this.sessions.length }),
      unwrap: (res: any) => ({ rows: res.rows, total: res.total }),
      initial: { page: 1, limit: 10 },
    });
  }

  /** Grid Refresh button → re-fetch the live session list. */
  refreshList(): void {
    this.refresh();
  }

  /** Emitted by the datasource picker (init hydrate + change). */
  onDatasourceChange(id: string): void {
    this.datasourceId = id || '';
    this.allSessions = [];
    this.sessions = [];
    this.selfPid = 0;
    this.filterValues = { name: '', state: null, hideBackground: true };
    if (!this.datasourceId) {
      this.cdr.markForCheck();
      return;
    }
    this.refresh();
  }

  refresh(): void {
    if (!this.datasourceId) return;
    this.dbAccess
      .loadSessions(this.datasourceId)
      .then(res => {
        if (res?.status) {
          this.allSessions = res.data?.sessions ?? [];
          this.selfPid = res.data?.selfPid ?? 0;
          this.applyFilters();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
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
    const name = (this.filterValues.name || '').trim().toLowerCase();
    const state = this.filterValues.state;
    const hideBg = this.filterValues.hideBackground;
    this.sessions = this.allSessions.filter(s => {
      // Background workers have a backend_type other than 'client backend'.
      if (hideBg && !this.isClientBackend(s)) return false;
      if (state && (s.state || '') !== state) return false;
      if (name) {
        const hay = [s.user, s.database, s.applicationName, s.query, String(s.pid)]
          .map(v => (v || '').toLowerCase())
          .join(' ');
        if (!hay.includes(name)) return false;
      }
      return true;
    });
    // Hand the fresh rows to the grid.
    this.adapter?.reload();
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
