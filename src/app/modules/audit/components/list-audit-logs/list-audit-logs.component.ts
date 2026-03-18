import { Component, OnInit, ViewChild } from '@angular/core';
import { AuditService } from '../../services/audit.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ROLES } from 'src/app/constants/user.constant';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants/global';

@Component({
  selector: 'app-list-audit-logs',
  templateUrl: './list-audit-logs.component.html',
  styleUrls: ['./list-audit-logs.component.scss'],
})
export class ListAuditLogsComponent implements OnInit {
  Math = Math;

  @ViewChild('dt') dt!: Table;
  private searchSubject = new Subject<void>();

  logs: any[] = [];
  totalItems = 0;
  lastTableLazyLoadEvent: any;

  showDetailDialog = false;
  selectedLog: any = null;

  isSuperAdmin = false;
  organisations: any[] = [];
  organisationOptions: any[] = [];

  filterValues: any = {
    username: '',
    module: null,
    action: null,
    entityName: '',
    organisationId: null,
  };

  moduleOptions = [
    { label: 'Org Admin', value: 'org-admin' },
    { label: 'User', value: 'user' },
    { label: 'Database', value: 'database' },
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

  constructor(
    private auditService: AuditService,
    private globalService: GlobalService,
    private organisationService: OrganisationService,
  ) {}

  ngOnInit(): void {
    this.isSuperAdmin =
      this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

    if (this.isSuperAdmin) {
      this.loadOrganisations();
    }

    this.searchSubject.pipe(debounceTime(500)).subscribe(() => {
      if (this.lastTableLazyLoadEvent) {
        this.loadLogs(this.lastTableLazyLoadEvent);
      }
    });
  }

  loadOrganisations() {
    this.organisationService
      .listOrganisation({ page: DEFAULT_PAGE, limit: MAX_LIMIT })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.organisations = res.data.orgs || [];
          // Only show non-default organisations (exclude super org)
          this.organisationOptions = this.organisations
            .filter((org: any) => org.isDefault !== 1)
            .map((org: any) => ({
              label: org.name,
              value: org.id,
            }));
          // Do not auto-select — let user pick an organisation
        }
      })
      .catch(() => {});
  }

  onOrganisationChange() {
    // Reset module filter when org changes
    this.filterValues.module = null;
    this.onFilterChange();
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
      !!this.filterValues.organisationId
    );
  }

  clearFilters() {
    const orgId = this.filterValues.organisationId;
    this.filterValues = {
      username: '',
      module: null,
      action: null,
      entityName: '',
      organisationId: this.isSuperAdmin ? orgId : null,
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

  getChangeRows(): { field: string; oldVal: any; newVal: any; changed: boolean }[] {
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

    const detailObj = m.createdUser || m.deletedUser;
    if (!detailObj || typeof detailObj !== 'object') return [];

    return Object.keys(detailObj).map(k => ({
      key: this.formatKey(k),
      value: detailObj[k] ?? '-',
    }));
  }

  formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }

  loadLogs(event: any) {
    this.lastTableLazyLoadEvent = event;

    const page = event.first / event.rows + 1;
    const limit = event.rows;

    const params: any = { page, limit };
    const filter: any = {};

    if (this.filterValues.username) {
      filter.username = this.filterValues.username;
    }
    if (this.filterValues.module) {
      filter.module = this.filterValues.module;
    }
    if (this.filterValues.action) {
      filter.action = this.filterValues.action;
    }
    if (this.filterValues.entityName) {
      filter.entityName = this.filterValues.entityName;
    }
    if (this.filterValues.organisationId) {
      filter.organisationId = this.filterValues.organisationId;
    }

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.auditService
      .listAuditLogs(params)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.logs = res.data.logs;
          this.totalItems = res.data.count;
        }
      })
      .catch(() => {});
  }
}
