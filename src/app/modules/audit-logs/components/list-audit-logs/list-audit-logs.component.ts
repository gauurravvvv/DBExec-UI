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
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { AuditService } from '../../services/audit.service';

/**
 * Audit-logs listing — renders through the shared `<app-custom-table>`
 * (the app's unified list table) driven by a `UsServerListAdapter` on the
 * BE `/audit-logs` list call. Infinite scroll (no page controls), a single
 * global search plus on-demand per-column filters (shared inputs). Lists
 * logs at the org level, so the adapter binds directly in ngOnInit — there
 * is no datasource dropdown on this page.
 *
 * Read-only — no row selection, no bulk delete, no row actions beyond the
 * "view detail" popup triggered by clicking the name.
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

  Math = Math;
  today = new Date();
  totalCount = 0;

  /* ── detail popup state — UNCHANGED ──────────────────── */

  showDetailDialog = false;
  selectedLog: any = null;

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE audit list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
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
    this.cols = this.buildColumns();
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant('AUDIT.SEARCH_PLACEHOLDER'),
    };
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.auditService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'entityName', field: 'entityName', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text', sortable: false },
      { colId: 'username', field: 'username', header: t('AUDIT.PERFORMED_BY'), width: '192px', filter: 'text', sortable: false },
      { colId: 'action', field: 'action', header: t('AUDIT.ACTION'), width: '144px', filter: 'text' },
      { colId: 'version', field: 'version', header: t('AUDIT.VERSION'), width: '96px', sortable: false },
      { colId: 'status', field: 'responseSuccess', header: t('COMMON.STATUS'), width: '144px', sortable: false },
      { colId: 'createdOn', field: 'createdOn', header: t('AUDIT.TIMESTAMP'), width: '224px' },
      { colId: 'ipAddress', field: 'ipAddress', header: t('AUDIT.IP_ADDRESS'), width: '160px', filter: 'text', sortable: false },
      { colId: 'justification', field: 'justification', header: t('AUDIT.JUSTIFICATION'), width: '256px', filter: 'text', sortable: false },
    ];
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter() {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.auditService.listAuditLogs({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // Custom unwrap — the BE returns `{ logs: [], count }`.
      unwrap: (res: any) => {
        const rows = res?.data?.logs ?? [];
        const total = res?.data?.count ?? 0;
        this.totalCount = total;
        // Push count into Page-level Export gating outside CD cycle.
        Promise.resolve().then(() => this.cdr.markForCheck());
        return { rows, total };
      },
      // custom-table sends PLAIN filter values (global `search` + per-column
      // entityName/username/action/status/ipAddress/justification), so the
      // adapter's identity mapping passes them straight through — no AG-Grid
      // cell unwrapping needed.
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  refreshList() {
    this.adapter?.reload();
  }

  /* ── detail popup helpers — UNCHANGED ──────────────────── */

  getActionClass(action: string): string {
    switch (action) {
      case 'CREATE':
        return 'action-create';
      case 'UPDATE':
        return 'action-update';
      case 'DELETE':
        return 'action-delete';
      case 'LOGIN':
      case 'LOGOUT':
        return 'action-auth';
      case 'RESET_PASSWORD':
        return 'action-warning';
      default:
        return 'action-default';
    }
  }

  showDetail(log: any) {
    this.selectedLog = log;
    this.showDetailDialog = true;
  }

  hasChangeComparison(): boolean {
    const m = this.selectedLog?.metadata;
    return m && m.oldValues && m.newValues;
  }

  getChangeRows(): {
    field: string;
    oldVal: any;
    newVal: any;
    changed: boolean;
  }[] {
    const m = this.selectedLog?.metadata;
    if (!m?.oldValues || !m?.newValues) return [];

    const keys = Object.keys(m.oldValues);
    return keys.map(k => ({
      field: this.formatKey(k),
      oldVal: m.oldValues[k] ?? '-',
      newVal: m.newValues[k] ?? '-',
      changed: String(m.oldValues[k]) !== String(m.newValues[k]),
    }));
  }

  getEntityDetails(): { key: string; value: any }[] {
    const m = this.selectedLog?.metadata;
    if (!m) return [];

    const items: { key: string; value: any }[] = [];

    // Entity snapshot (CREATE / DELETE / RESET_PASSWORD)
    const detailObj = m.entity;
    if (detailObj && typeof detailObj === 'object') {
      for (const k of Object.keys(detailObj)) {
        items.push({ key: this.formatKey(k), value: detailObj[k] ?? '-' });
      }
    }

    // Extra context fields (visualCount, userCount, columnCount, etc.)
    for (const [k, v] of Object.entries(m)) {
      if (
        k === 'entity' ||
        k === 'oldValues' ||
        k === 'newValues' ||
        k === 'justification'
      )
        continue;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) continue;
      items.push({
        key: this.formatKey(k),
        value: Array.isArray(v) ? v.join(', ') : (v ?? '-'),
      });
    }

    return items;
  }

  // Field label map matching backend FIELD_LABELS
  private readonly fieldLabels: Record<string, string> = {
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email',
    role: 'Role',
    status: 'Status',
    isDefault: 'Default User',
    name: 'Name',
    description: 'Description',
    datasourceName: 'Datasource',
    dbUsername: 'DB Username',
    dbType: 'DB Type',
    hostname: 'Hostname',
    port: 'Port',
    isMasterDB: 'Master Datasource',
    sql: 'SQL Query',
    type: 'Type',
    datasetName: 'Dataset',
    columnCount: 'Column Count',
    columns: 'Columns',
    queryBuilderName: 'Query Builder',
    relatedAnalysesCount: 'Related Analyses',
    columnToUse: 'Column (Use)',
    columnToView: 'Column (View)',
    customLogic: 'Custom Logic',
    isCfUsed: 'Custom Field Used',
    sequence: 'Sequence',
    analysisName: 'Analysis',
    visualCount: 'Visual Count',
    promptCount: 'Prompt Count',
    tabCount: 'Tab Count',
    tabName: 'Tab',
    sectionName: 'Section',
    mandatory: 'Mandatory',
    prompt_schema: 'Schema',
    prompt_table: 'Table',
    prompt_column: 'Column',
    prompt_join: 'Join',
    prompt_where: 'Where',
    prompt_sql: 'SQL',
    prompt_values_sql: 'Values SQL',
    schema: 'Schema',
    tables: 'Tables',
    hasJoin: 'Has Join',
    hasWhere: 'Has Where',
    valueCount: 'Value Count',
    valuesAdded: 'Values Added',
    valuesDeleted: 'Values Deleted',
    appearance: 'Appearance',
    config: 'Configuration',
    usersAdded: 'Users Added',
    usersRemoved: 'Users Removed',
    groupsAdded: 'Groups Added',
    groupsRemoved: 'Groups Removed',
    userCount: 'User Count',
    userIds: 'User IDs',
    visibility: 'Visibility',
  };

  trackByIndex(index: number): number {
    return index;
  }

  formatKey(key: string): string {
    if (this.fieldLabels[key]) return this.fieldLabels[key];
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }

  /* ── BE PDF export — preserved (full filtered set) ──── */

  /**
   * Build the BE-shape filter payload from the adapter's current
   * filterModel. custom-table stores PLAIN filter values, so the slice
   * passed to the BE export is a straight pass-through of the model.
   */
  private getExportFilterParams(): any {
    if (!this.adapter) return {};
    const model = this.adapter.filterModel();
    const filter: any = {};

    if (model['entityName']) filter.entityName = model['entityName'];
    if (model['username']) filter.username = model['username'];
    if (model['action']) filter.action = model['action'];
    if (model['ipAddress']) filter.ipAddress = model['ipAddress'];
    if (model['justification']) filter.justification = model['justification'];
    if (model['search']) filter.search = model['search'];

    if (model['status'] !== undefined && model['status'] !== null) {
      const v = model['status'];
      if (v !== '' && v !== null && v !== undefined) {
        filter.status =
          typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true';
      }
    }

    return filter;
  }

  exportLogs(format: 'pdf') {
    const filter = this.getExportFilterParams();
    const params: any = { format };
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

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
            message: 'Failed to export audit logs',
          });
        },
      });
  }
}
