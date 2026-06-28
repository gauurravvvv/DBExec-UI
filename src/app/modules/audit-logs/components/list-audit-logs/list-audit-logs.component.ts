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
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { AuditService } from '../../services/audit.service';

/**
 * Audit-logs listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the BE `/audit-logs` list call. The
 * page header / content card / detail popup retain the existing
 * styling and behaviour; only the `<p-table>` was swapped out for
 * the AG Grid wrapper. There is no datasource dropdown on this
 * page — it lists logs at the org level, so the adapter binds
 * directly in ngOnInit.
 *
 * Read-only — no row selection, no bulk delete, no row actions
 * beyond the "view detail" popup triggered by clicking the name.
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

  /* ── grid wiring ─────────────────────────────────────── */

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
    gridKey: 'audit-logs-list',
    pageSizeOptions: [25, 50, 100],
    pageSize: 25,
    height: 'calc(100vh - 280px)',
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
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.auditService.cancelReads();
    this.adapter?.destroy();
  }

  get isFilterActive(): boolean {
    return !!this.adapter && Object.keys(this.adapter.filterModel()).length > 0;
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): ColDef[] {
    return [
      {
        colId: 'entityName',
        field: 'entityName',
        headerName: this.translate.instant('COMMON.NAME'),
        width: 224,
        minWidth: 224,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
        pinned: 'left',
      },
      {
        colId: 'username',
        field: 'username',
        headerName: this.translate.instant('AUDIT.PERFORMED_BY'),
        width: 192,
        minWidth: 192,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
      {
        colId: 'action',
        field: 'action',
        headerName: this.translate.instant('AUDIT.ACTION'),
        width: 144,
        minWidth: 144,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'version',
        field: 'version',
        headerName: this.translate.instant('AUDIT.VERSION'),
        width: 96,
        minWidth: 96,
        sortable: false,
        filter: false,
      },
      {
        colId: 'status',
        field: 'responseSuccess',
        headerName: this.translate.instant('COMMON.STATUS'),
        width: 144,
        minWidth: 144,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
      {
        colId: 'createdOn',
        field: 'createdOn',
        headerName: this.translate.instant('AUDIT.TIMESTAMP'),
        width: 224,
        minWidth: 224,
        filter: 'agDateColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'ipAddress',
        field: 'ipAddress',
        headerName: this.translate.instant('AUDIT.IP_ADDRESS'),
        width: 160,
        minWidth: 160,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
      {
        colId: 'justification',
        field: 'justification',
        headerName: this.translate.instant('AUDIT.JUSTIFICATION'),
        minWidth: 256,
        flex: 1,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
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
      // Floating-filter cell value → BE filter slice. The grid's
      // floating filters emit AG-Grid-shaped cells; this map flattens
      // them into the
      // `{username, module, action, entityName, status, ipAddress,
      //   justification, dateFrom, dateTo}` shape the BE expects.
      filterBuilders: {
        entityName: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined
            ? {}
            : { entityName: v };
        },
        username: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined
            ? {}
            : { username: v };
        },
        action: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined ? {} : { action: v };
        },
        status: cell => {
          const v = (cell as any)?.filter ?? cell;
          if (v === '' || v === null || v === undefined) return {};
          // Accept "true"/"false" or boolean. BE expects boolean.
          const bool = typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true';
          return { status: bool };
        },
        ipAddress: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined
            ? {}
            : { ipAddress: v };
        },
        justification: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined
            ? {}
            : { justification: v };
        },
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
      },
      initial: { page: 1, limit: 25 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  clearFilters() {
    if (!this.adapter) return;
    this.adapter.setFilter({});
    this.adapter.setSort([]);
  }

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
   * filterModel. The grid stores AG-Grid-shaped cells (`{filter,
   * type, ...}` or `{dateFrom, dateTo, ...}`); this flattens them
   * back into the slice the BE export expects.
   */
  private getExportFilterParams(): any {
    if (!this.adapter) return {};
    const model = this.adapter.filterModel();
    const filter: any = {};

    const flatten = (cell: any) => (cell?.filter ?? cell);

    if (model['entityName']) filter.entityName = flatten(model['entityName']);
    if (model['username']) filter.username = flatten(model['username']);
    if (model['action']) filter.action = flatten(model['action']);
    if (model['ipAddress']) filter.ipAddress = flatten(model['ipAddress']);
    if (model['justification'])
      filter.justification = flatten(model['justification']);

    if (model['status'] !== undefined && model['status'] !== null) {
      const v = flatten(model['status']);
      if (v !== '' && v !== null && v !== undefined) {
        filter.status =
          typeof v === 'boolean' ? v : String(v).toLowerCase() === 'true';
      }
    }

    const dateCell: any = model['createdOn'];
    if (dateCell?.dateFrom) {
      filter.dateFrom = new Date(dateCell.dateFrom).toISOString();
    }
    if (dateCell?.dateTo) {
      const to = new Date(dateCell.dateTo);
      to.setHours(23, 59, 59, 999);
      filter.dateTo = to.toISOString();
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
