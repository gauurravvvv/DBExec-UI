import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { GlobalService } from 'src/app/core/services/global.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { AuditService } from '../../services/audit.service';

type AuditLogSortField = 'action' | 'createdOn';

@Component({
  selector: 'app-list-audit-logs',
  templateUrl: './list-audit-logs.component.html',
  styleUrls: ['./list-audit-logs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListAuditLogsComponent implements OnInit, OnDestroy {
  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadLogs(this.lastTableLazyLoadEvent);
    }
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.auditService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);
  private searchSubject = new Subject<void>();

  Math = Math;

  @ViewChild('dt') dt!: Table;

  // Expose service signals as component refs
  logs = this.auditService.logs;
  totalItems = this.auditService.logsTotal;
  loading = this.auditService.logsLoading;

  lastTableLazyLoadEvent: any;
  sortHelper = new ListSortHelper<AuditLogSortField>();

  showDetailDialog = false;
  selectedLog: any = null;

  today = new Date();

  filterValues: any = {
    username: '',
    module: null,
    action: null,
    entityName: '',
    status: null,
    ipAddress: '',
    justification: '',
    dateRange: null,
  };

  moduleOptions = [
    { label: 'User', value: 'user' },
    { label: 'Datasource', value: 'datasource' },
    { label: 'Group', value: 'group' },
    { label: 'Connection', value: 'connection' },
    { label: 'Dataset', value: 'dataset' },
    { label: 'Access', value: 'access' },
  ];

  actionOptions = [
    { label: 'Create', value: 'CREATE' },
    { label: 'Update', value: 'UPDATE' },
    { label: 'Delete', value: 'DELETE' },
  ];

  statusOptions: { label: string; value: boolean }[] = [];

  constructor(
    private auditService: AuditService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.statusOptions = [
      { label: this.translate.instant('AUDIT.SUCCESS'), value: true },
      { label: this.translate.instant('AUDIT.FAILED'), value: false },
    ];

    this.searchSubject
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.lastTableLazyLoadEvent) {
          this.loadLogs(this.lastTableLazyLoadEvent);
        }
      });
  }

  onFilterChange() {
    this.searchSubject.next();
  }

  refreshLogs() {
    if (this.lastTableLazyLoadEvent) {
      this.loadLogs(this.lastTableLazyLoadEvent);
    }
  }

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.username ||
      !!this.filterValues.module ||
      !!this.filterValues.action ||
      !!this.filterValues.entityName ||
      this.filterValues.status !== null ||
      !!this.filterValues.ipAddress ||
      !!this.filterValues.justification ||
      !!this.filterValues.dateRange
    );
  }

  clearFilters() {
    this.filterValues = {
      username: '',
      module: null,
      action: null,
      entityName: '',
      status: null,
      ipAddress: '',
      justification: '',
      dateRange: null,
    };
    this.onFilterChange();
  }

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

  onDateRangeChange(range: Date[] | null) {
    this.filterValues.dateRange = range;
    // Only trigger filter when both dates are selected (or cleared)
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  private getFilterParams(): any {
    const filter: any = {};
    if (this.filterValues.username)
      filter.username = this.filterValues.username;
    if (this.filterValues.module) filter.module = this.filterValues.module;
    if (this.filterValues.action) filter.action = this.filterValues.action;
    if (this.filterValues.entityName)
      filter.entityName = this.filterValues.entityName;
    if (this.filterValues.status !== null)
      filter.status = this.filterValues.status;
    if (this.filterValues.ipAddress)
      filter.ipAddress = this.filterValues.ipAddress;
    if (this.filterValues.justification)
      filter.justification = this.filterValues.justification;
    if (this.filterValues.dateRange?.[0])
      filter.dateFrom = this.filterValues.dateRange[0].toISOString();
    if (this.filterValues.dateRange?.[1]) {
      // Set end of day for the "to" date
      const dateTo = new Date(this.filterValues.dateRange[1]);
      dateTo.setHours(23, 59, 59, 999);
      filter.dateTo = dateTo.toISOString();
    }
    return filter;
  }

  exportLogs(format: 'pdf') {
    const filter = this.getFilterParams();
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

  toggleSort(field: AuditLogSortField) {
    this.sortHelper.toggle(field);
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
      this.loadLogs(this.lastTableLazyLoadEvent);
    }
  }

  loadLogs(event: any) {
    this.lastTableLazyLoadEvent = event;
    const page = event.first / event.rows + 1;
    const limit = event.rows;
    const params: any = { page, limit };
    const filter = this.getFilterParams();
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    const sortParam = this.sortHelper.serialize();
    if (sortParam) params.sort = sortParam;

    this.auditService.loadAuditLogs(params);
  }
}
