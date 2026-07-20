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
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import {
  ACTION_CLASS,
  ACTION_FILTER_OPTIONS,
  ACTION_LABEL_KEY,
  MODULE_FALLBACK,
  MODULE_FILTER_OPTIONS,
  MODULE_META,
} from '../../audit-meta.constant';
import { AuditLog, ChainVerifyResult } from '../../models/audit-log.model';
import { AuditService } from '../../services/audit.service';

interface FilterOption {
  value: string;
  label: string;
}

/**
 * Audit-logs listing — the app's audit & activity trail rendered through the
 * shared `<app-custom-table>` driven by a `UsServerListAdapter` on the BE
 * `/audit-logs` list call. Infinite scroll, a rich filter toolbar (module
 * multiselect, action dropdown, actor search, daterange, failures-only
 * toggle, export), and a right-side detail drawer opened by clicking a row.
 *
 * NAMES ONLY — every column renders `actorName` / `entityName` (with
 * "Unknown user" / "System Admin" fallbacks); no raw actorId / entityId is
 * ever shown.
 *
 * ONE component, TWO entry points: the global Audit screen (unscoped) and the
 * User-Management → Activity view. The latter passes
 * `data.moduleScope = ['user','group','role']` on its route; when present the
 * module filter is LOCKED to that scope and the module control is hidden.
 */
@Component({
  selector: 'app-list-audit-logs',
  templateUrl: './list-audit-logs.component.html',
  styleUrls: ['./list-audit-logs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListAuditLogsComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);

  totalCount = 0;

  /* ── tamper-evidence (hash chain) ─────────────────────── */

  integrity: ChainVerifyResult | null = null;
  integrityChecking = false;

  /** Route-supplied module scope (User-Mgmt Activity view). Empty = global. */
  moduleScope: string[] = [];
  get isScoped(): boolean {
    return this.moduleScope.length > 0;
  }

  /* ── filter model ─────────────────────────────────────── */

  selectedModules: string[] = [];
  selectedAction: string | null = null;
  actorSearch = '';
  entitySearch = '';
  dateRange: Date[] | null = null;
  failuresOnly = false;

  moduleOptions: FilterOption[] = [];
  actionOptions: FilterOption[] = [];

  /* ── asset-history scope (the fast "one asset's timeline" mode) ────
   * When a rootId is active the list is scoped to ONE asset's complete
   * history — its parent event plus every child event that shares the same
   * rootId (e.g. a dataset + all its calc-field changes). While scoped we
   * order by assetVersion so the stream reads as a clean v1→vN timeline and
   * show a removable context header. rootId is a filter value only — never
   * rendered as text. */
  rootId: string | null = null;
  rootType: string | null = null;
  rootEntityName: string | null = null;

  /** Debounces the entity-name text search so each keystroke doesn't rebind
   *  the adapter / re-hit the BE. */
  private entitySearch$ = new Subject<string>();

  get isRootScoped(): boolean {
    return !!this.rootId;
  }

  /* ── drawer state ─────────────────────────────────────── */

  drawerVisible = false;
  selectedLog: AuditLog | null = null;

  /* ── custom-table wiring ──────────────────────────────── */

  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'search',
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: false,
    enableExport: false, // page-level export lives in the toolbar
    gridKey: 'audit-logs-list',
    height: 'flex',
    rowIdField: 'id',
  };

  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private auditService: AuditService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    // Route data may scope this instance to User-Management modules. With the
    // default 'emptyOnly' inheritance the lazy module's empty-path child
    // inherits the parent route's data, so moduleScope arrives here.
    const scope = this.route.snapshot.data?.['moduleScope'];
    this.moduleScope = Array.isArray(scope) ? scope : [];

    this.cols = this.buildColumns();
    this.moduleOptions = MODULE_FILTER_OPTIONS.map(o => ({
      value: o.value,
      label: this.translate.instant(o.labelKey),
    }));
    this.actionOptions = ACTION_FILTER_OPTIONS.map(o => ({
      value: o.value,
      label: this.translate.instant(o.labelKey),
    }));

    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant('AUDIT.SEARCH_PLACEHOLDER'),
    };

    // Debounced entity-name search → single re-query after the user pauses.
    this.entitySearch$
      .pipe(debounceTime(350), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyFilter());

    this.bindAdapter();
    this.verifyIntegrity();
  }

  ngOnDestroy(): void {
    this.auditService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── columns ──────────────────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'module', field: 'module', header: t('AUDIT.COL_MODULE'), width: '260px', frozen: true, sortable: false },
      { colId: 'action', field: 'action', header: t('AUDIT.ACTION'), width: '124px', sortable: false },
      { colId: 'version', field: 'assetVersion', header: t('AUDIT.VERSION'), width: '84px', align: 'center', sortable: false },
      { colId: 'entity', field: 'entityName', header: t('AUDIT.COL_ENTITY'), width: '188px', sortable: false },
      { colId: 'actor', field: 'actorName', header: t('AUDIT.PERFORMED_BY'), width: '200px', sortable: false },
      { colId: 'when', field: 'createdOn', header: t('AUDIT.COL_WHEN'), width: '180px' },
      { colId: 'origin', field: 'ipAddress', header: t('AUDIT.COL_ORIGIN'), width: '132px', sortable: false },
      { colId: 'outcome', field: 'responseSuccess', header: t('AUDIT.OUTCOME'), width: '124px', sortable: false },
      { colId: 'history', field: 'id', header: '', width: '52px', align: 'center', sortable: false },
    ];
  }

  /* ── cell presentation helpers ────────────────────────── */

  moduleIcon(module: string | null | undefined): string {
    return (module && MODULE_META[module]?.icon) || MODULE_FALLBACK.icon;
  }

  moduleLabel(module: string | null | undefined): string {
    const key = (module && MODULE_META[module]?.labelKey) || MODULE_FALLBACK.labelKey;
    return this.translate.instant(key);
  }

  actionClass(action: string | null | undefined): string {
    return (action && ACTION_CLASS[action]) || 'act-default';
  }

  actionLabel(action: string | null | undefined): string {
    if (!action) return '';
    const key = ACTION_LABEL_KEY[action];
    return key ? this.translate.instant(key) : action;
  }

  actorDisplay(log: AuditLog): string {
    if (log.actorName && log.actorName.trim()) return log.actorName;
    return this.translate.instant('AUDIT.UNKNOWN_USER');
  }

  isSystemActor(log: AuditLog): boolean {
    return log.actorType === 'system-admin' || log.actorType === 'system';
  }

  initials(log: AuditLog): string {
    const name = log.actorName?.trim();
    if (!name) return '?';
    if (log.actorType === 'system-admin') return 'SA';
    if (log.actorType === 'system') return 'SY';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  entityLabel(log: AuditLog): string {
    return log.entityName?.trim() || '—';
  }

  /** Version badge text, e.g. "v4". Empty when the row carries no version. */
  versionLabel(log: AuditLog): string {
    return log.assetVersion != null
      ? `${this.translate.instant('AUDIT.VERSION_PREFIX')}${log.assetVersion}`
      : '';
  }

  /** A row can jump to an asset timeline only if it carries a rootId. */
  canJump(log: AuditLog | null | undefined): boolean {
    return !!log?.rootId;
  }

  /* ── adapter wiring ───────────────────────────────────── */

  /** Assemble the BE `filter` object from the toolbar model + scope. */
  private buildFilter(): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    // Asset-history scope wins: pin to one rootId (whole-asset timeline).
    // The module/entity/actor/date facets still layer on top so a user can
    // narrow within an asset's history if they want.
    if (this.isRootScoped) {
      filter['rootId'] = this.rootId;
      if (this.rootType) filter['rootType'] = this.rootType;
    }

    // Module scope (locked) OR user-selected modules.
    if (this.isScoped) {
      filter['module'] = this.moduleScope;
    } else if (this.selectedModules.length > 0) {
      filter['module'] = this.selectedModules;
    }

    if (this.selectedAction) filter['action'] = this.selectedAction;
    if (this.actorSearch.trim()) filter['actor'] = this.actorSearch.trim();
    if (this.entitySearch.trim()) filter['entityName'] = this.entitySearch.trim();
    if (this.failuresOnly) filter['outcome'] = 'failure';

    if (this.dateRange && this.dateRange.length) {
      const [from, to] = this.dateRange;
      if (from) filter['dateFrom'] = this.toIso(from, false);
      if (to) filter['dateTo'] = this.toIso(to, true);
    }

    return filter;
  }

  /**
   * Sort payload sent to the BE. In the default list the table owns sort
   * (createdOn DESC). While scoped to one asset we override to
   * assetVersion ASC so the timeline reads v1→vN top-to-bottom.
   */
  private buildSort(): string | undefined {
    if (this.isRootScoped) {
      return JSON.stringify([{ field: 'assetVersion', order: 'asc' }]);
    }
    return undefined;
  }

  /** Normalise a picked date to an ISO string (end-of-day for the upper bound). */
  private toIso(d: Date, endOfDay: boolean): string {
    const x = new Date(d);
    if (endOfDay) x.setHours(23, 59, 59, 999);
    else x.setHours(0, 0, 0, 0);
    return x.toISOString();
  }

  private bindAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) => {
        // Merge the toolbar filter with the table's own global-search filter.
        // The adapter serialises its filterModel to a JSON STRING in
        // `params.filter` (the table writes global `search` there), so parse
        // it before merging. The toolbar owns module/action/actor/date/
        // outcome; the table owns the global `search` key.
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
        // When scoped to one asset, force assetVersion-ASC ordering so the
        // stream reads as a v1→vN timeline; otherwise honour the table's own
        // sort (default createdOn DESC).
        const scopedSort = this.buildSort();
        if (scopedSort) req['sort'] = scopedSort;
        else if (params.sort) req['sort'] = params.sort;
        if (Object.keys(merged).length) req['filter'] = JSON.stringify(merged);
        return this.auditService.listAuditLogs(req);
      },
      // BE returns `{ data: { logs: [], count } }`.
      unwrap: (res: any) => {
        const rows = (res?.data?.logs ?? []) as AuditLog[];
        const total = res?.data?.count ?? 0;
        this.totalCount = total;
        Promise.resolve().then(() => this.cdr.markForCheck());
        return { rows, total };
      },
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  /** Re-apply the toolbar filter — rebuild so the load closure captures it. */
  private applyFilter(): void {
    this.bindAdapter();
  }

  /* ── toolbar handlers ─────────────────────────────────── */

  onModulesChange(values: string[]): void {
    this.selectedModules = values ?? [];
    this.applyFilter();
  }

  onActionChange(value: string | null): void {
    this.selectedAction = value;
    this.applyFilter();
  }

  onActorSearch(value: string): void {
    this.actorSearch = value ?? '';
    this.applyFilter();
  }

  onEntitySearch(value: string): void {
    this.entitySearch = value ?? '';
    this.entitySearch$.next(this.entitySearch);
  }

  onDateRangeChange(range: Date[] | null): void {
    this.dateRange = range;
    // Only re-query once a full range (or a clear) is picked.
    if (!range || range.length === 0 || (range[0] && range[1]) || range[0] === null) {
      this.applyFilter();
    }
  }

  onFailuresToggle(evt: { checked: boolean }): void {
    this.failuresOnly = !!evt?.checked;
    this.applyFilter();
  }

  clearFilters(): void {
    this.selectedModules = [];
    this.selectedAction = null;
    this.actorSearch = '';
    this.entitySearch = '';
    this.dateRange = null;
    this.failuresOnly = false;
    this.applyFilter();
  }

  get hasActiveFilters(): boolean {
    return (
      (!this.isScoped && this.selectedModules.length > 0) ||
      !!this.selectedAction ||
      !!this.actorSearch.trim() ||
      !!this.entitySearch.trim() ||
      !!(this.dateRange && this.dateRange.length) ||
      this.failuresOnly
    );
  }

  refreshList(): void {
    this.adapter?.reload();
  }

  /* ── asset-history scope (the core findability flow) ──────────────────
   * One click on a row's "View asset history" control (list row or drawer)
   * re-filters the list to that asset's rootId — surfacing its COMPLETE
   * timeline (v1..vN, child field events folded in) ordered v1→vN. A
   * removable context header ("History of: <entityName>") tells the user
   * they're scoped and lets them clear back to the full list. */

  jumpToAssetHistory(log: AuditLog | null | undefined): void {
    if (!log?.rootId) return;
    this.rootId = log.rootId;
    this.rootType = log.rootType ?? null;
    // Prefer the entity name of the row clicked; the header just needs a
    // human label for the asset (NEVER the rootId itself).
    this.rootEntityName = log.entityName?.trim() || null;
    // Close the drawer if it was the launch point, then reload scoped.
    this.drawerVisible = false;
    this.selectedLog = null;
    this.applyFilter();
    this.cdr.markForCheck();
  }

  /** Human label for the scope header — falls back to the root's type/module
   *  label; never exposes the rootId. */
  rootScopeLabel(): string {
    if (this.rootEntityName) return this.rootEntityName;
    const type = this.rootType;
    if (type) {
      const key =
        MODULE_META[type]?.labelKey ?? MODULE_FALLBACK.labelKey;
      return this.translate.instant(key);
    }
    return this.translate.instant('AUDIT.THIS_ASSET');
  }

  clearRootScope(): void {
    this.rootId = null;
    this.rootType = null;
    this.rootEntityName = null;
    this.applyFilter();
    this.cdr.markForCheck();
  }

  /* ── tamper-evidence badge ────────────────────────────── */

  /** Verify the org's audit hash chain and drive the integrity badge. */
  verifyIntegrity(): void {
    this.integrityChecking = true;
    this.integrity = null;
    this.cdr.markForCheck();
    this.auditService
      .verifyAuditChain()
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

  openDetail(log: AuditLog): void {
    // Show immediately from the list row (it already carries before/after),
    // then lazily refresh the full detail so the drawer is always complete.
    this.selectedLog = log;
    this.drawerVisible = true;
    this.auditService.setSelected(log);
    this.cdr.markForCheck();

    if (log?.id) {
      this.auditService
        .getAuditLog(log.id)
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

  exportLogs(format: 'pdf'): void {
    const filter = this.buildFilter();
    const params: Record<string, unknown> = { format };
    if (Object.keys(filter).length > 0) params['filter'] = JSON.stringify(filter);

    this.auditService
      .exportAuditLogs(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob: Blob) => {
          const dateStr = new Date().toISOString().slice(0, 10);
          const fileName = `Audit_Logs_${dateStr}.pdf`;
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          window.URL.revokeObjectURL(url);
        },
        error: () => {
          this.globalService.handleSuccessService({
            status: false,
            code: 500,
            message: this.translate.instant('AUDIT.EXPORT_FAILED'),
          });
        },
      });
  }
}
