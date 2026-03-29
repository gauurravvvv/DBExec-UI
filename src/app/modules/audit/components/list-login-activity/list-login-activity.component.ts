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
  selector: 'app-list-login-activity',
  templateUrl: './list-login-activity.component.html',
  styleUrls: ['./list-login-activity.component.scss'],
})
export class ListLoginActivityComponent implements OnInit {
  Math = Math;

  @ViewChild('dt') dt!: Table;
  private searchSubject = new Subject<void>();

  activities: any[] = [];
  totalItems = 0;
  lastTableLazyLoadEvent: any;

  isSuperAdmin = false;
  organisations: any[] = [];
  organisationOptions: any[] = [];
  today = new Date();

  filterValues: any = {
    username: '',
    eventType: null,
    organisationName: '',
    organisationId: null,
    ipAddress: '',
    dateRange: null,
  };

  eventTypeOptions = [
    { label: 'Login Success', value: 'LOGIN_SUCCESS' },
    { label: 'Login Failed', value: 'LOGIN_FAILED' },
    { label: 'Logout', value: 'LOGOUT' },
    { label: 'Token Refresh', value: 'TOKEN_REFRESH' },
    { label: 'Password Reset', value: 'PASSWORD_RESET' },
    { label: 'OTP Generated', value: 'OTP_GENERATED' },
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
        this.loadActivities(this.lastTableLazyLoadEvent);
      }
    });
  }

  loadOrganisations() {
    this.organisationService
      .listOrganisation({ page: DEFAULT_PAGE, limit: MAX_LIMIT })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.organisations = res.data.orgs || [];
          this.organisationOptions = this.organisations
            .filter((org: any) => org.isDefault !== 1)
            .map((org: any) => ({
              label: org.name,
              value: org.id,
            }));
        }
      })
      .catch(() => {});
  }

  onOrganisationChange() {
    this.onFilterChange();
  }

  onFilterChange() {
    this.searchSubject.next();
  }

  onDateRangeChange(range: Date[] | null) {
    this.filterValues.dateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.username ||
      !!this.filterValues.eventType ||
      !!this.filterValues.organisationName ||
      !!this.filterValues.organisationId ||
      !!this.filterValues.ipAddress ||
      !!this.filterValues.dateRange
    );
  }

  refreshActivities() {
    if (this.lastTableLazyLoadEvent) {
      this.loadActivities(this.lastTableLazyLoadEvent);
    }
  }

  clearFilters() {
    const orgId = this.filterValues.organisationId;
    this.filterValues = {
      username: '',
      eventType: null,
      organisationName: '',
      organisationId: this.isSuperAdmin ? orgId : null,
      ipAddress: '',
      dateRange: null,
    };
    this.onFilterChange();
  }

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

  formatEventType(eventType: string): string {
    return eventType?.replace(/_/g, ' ') || '-';
  }

  private getFilterParams(): any {
    const filter: any = {};
    if (this.filterValues.username)
      filter.username = this.filterValues.username;
    if (this.filterValues.eventType)
      filter.eventType = this.filterValues.eventType;
    if (this.filterValues.organisationName)
      filter.organisationName = this.filterValues.organisationName;
    if (this.filterValues.organisationId)
      filter.organisationId = this.filterValues.organisationId;
    if (this.filterValues.ipAddress)
      filter.ipAddress = this.filterValues.ipAddress;
    if (this.filterValues.dateRange?.[0])
      filter.dateFrom = this.filterValues.dateRange[0].toISOString();
    if (this.filterValues.dateRange?.[1]) {
      const dateTo = new Date(this.filterValues.dateRange[1]);
      dateTo.setHours(23, 59, 59, 999);
      filter.dateTo = dateTo.toISOString();
    }
    return filter;
  }

  exportActivity(format: 'pdf') {
    const filter = this.getFilterParams();
    const params: any = { format };
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.auditService.exportLoginActivity(params).subscribe({
      next: (blob: Blob) => {
        const orgLabel =
          this.organisationOptions.find(
            (o: any) => o.value === this.filterValues.organisationId,
          )?.label || 'Organisation';
        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `Login_Activity_${orgLabel.replace(/\s+/g, '_')}_${dateStr}.pdf`;

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
          message: 'Failed to export login activity',
        });
      },
    });
  }

  loadActivities(event: any) {
    this.lastTableLazyLoadEvent = event;

    const page = event.first / event.rows + 1;
    const limit = event.rows;

    const params: any = { page, limit };
    const filter = this.getFilterParams();

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.auditService
      .listLoginActivity(params)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.activities = res.data.activities;
          this.totalItems = res.data.count;
        }
      })
      .catch(() => {});
  }
}
