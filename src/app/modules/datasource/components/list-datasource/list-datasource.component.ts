import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DATASOURCE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasourceService } from '../../services/datasource.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-datasource',
  templateUrl: './list-datasource.component.html',
  styleUrls: ['./list-datasource.component.scss'],
})
export class ListDatasourceComponent implements OnInit {
  @ViewChild('dt') dt!: Table;
  dbs: any[] = [];
  filteredDBs: any[] = [];
  listParams: any = {
    limit: 10,
    page: 1,
  };
  totalItems = 0;

  private searchSubject = new Subject<void>();
  lastTableLazyLoadEvent: any;

  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  selectedDatasource: any = null;
  showDeleteConfirm = false;
  deleteJustification = '';

  constructor(
    private datasourceService: DatasourceService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounce for filter changes
    this.searchSubject.pipe(debounceTime(500)).subscribe(() => {
      if (this.lastTableLazyLoadEvent) {
        this.loadDatasources(this.lastTableLazyLoadEvent);
      }
    });

    if (this.showOrganisationDropdown) {
      // Super Admin: Load organisations first, then trigger table load
      this.loadOrganisations();
    } else {
      // Non-Super Admin: Set org from token, lazy load will trigger automatically
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
    }
  }

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          // Trigger lazy load by resetting table, or call API directly if table not ready
          if (this.dt) {
            this.dt.reset();
          } else {
            // Table not ready yet, call API directly with default params
            this.listDatasourceAPI(this.selectedOrg);
          }
        } else {
          // No organisations found, clear everything
          this.selectedOrg = null;
          this.dbs = [];
          this.totalItems = 0;
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    // Reset table which triggers onLazyLoad -> loadDatasources
    if (this.dt) {
      this.dt.reset();
    }
  }

  today = new Date();

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

  filterValues: any = {
    name: '',
    description: '',
    status: null,
    createdDateRange: null,
  };

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      status: null,
      createdDateRange: null,
    };
    this.onFilterChange();
  }

  onFilterChange() {
    this.searchSubject.next();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadDatasources(event: any) {
    if (!event) return;
    this.lastTableLazyLoadEvent = event;
    const page = event.first / event.rows + 1;
    const limit = event.rows;

    this.listParams.page = page;
    this.listParams.limit = limit;

    this.listDatasourceAPI();
  }

  listDatasourceAPI(overrideOrgId?: any) {
    // Handle both object with .id property and primitive ID values
    let orgId = overrideOrgId || this.selectedOrg;
    if (typeof orgId === 'object' && orgId !== null) {
      orgId = orgId.id;
    }
    if (!orgId) return;

    const params: any = {
      orgId: orgId,
      page: this.listParams.page,
      limit: this.listParams.limit,
    };

    let filter: any = {};
    if (this.filterValues.name) filter.name = this.filterValues.name;
    if (this.filterValues.description)
      filter.description = this.filterValues.description;
    if (
      this.filterValues.status !== null &&
      this.filterValues.status !== undefined
    ) {
      filter.status = this.filterValues.status;
    }
    if (this.filterValues.createdDateRange?.[0]) {
      filter.createdDateFrom =
        this.filterValues.createdDateRange[0].toISOString();
    }
    if (this.filterValues.createdDateRange?.[1]) {
      const dateTo = new Date(this.filterValues.createdDateRange[1]);
      dateTo.setHours(23, 59, 59, 999);
      filter.createdDateTo = dateTo.toISOString();
    }

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.datasourceService
      .listDatasource(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.dbs = response.data.datasources || [];
          this.totalItems = response.data.count || 0;
        } else {
          // If response not successful, clear the list
          this.dbs = [];
          this.totalItems = 0;
        }
      })
      .catch(() => {
        // If API fails, clear the list
        this.dbs = [];
        this.totalItems = 0;
      });
  }

  onAddNewDatasource() {
    this.router.navigate([DATASOURCE.ADD]);
  }

  onEdit(db: any) {
    this.router.navigate([DATASOURCE.EDIT, db.organisationId, db.id]);
  }

  confirmDelete(datasource: any): void {
    this.selectedDatasource = datasource;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.selectedDatasource = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.selectedDatasource && this.deleteJustification.trim()) {
      this.datasourceService
        .deleteDatasource(
          this.selectedDatasource.organisationId,
          this.selectedDatasource.id,
          this.deleteJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadDatasources(this.lastTableLazyLoadEvent);
            }
            this.showDeleteConfirm = false;
            this.selectedDatasource = null;
            this.deleteJustification = '';
          }
        });
    }
  }
}
