import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ConnectionService } from '../../services/connection.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-connection',
  templateUrl: './list-connection.component.html',
  styleUrls: ['./list-connection.component.scss'],
})
export class ListConnectionComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  // Pagination limit for connections
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  users: any[] = [];
  filteredConnections: any[] = [];

  searchTerm: string = '';
  showDeleteConfirm = false;
  deleteJustification = '';
  tabToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  datasources: any[] = [];
  connections: any[] = [];
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  today = new Date();

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    dbUsername: '',
    status: null,
    createdDateRange: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      !!this.filterValues.dbUsername ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private datasourceService: DatasourceService,
    private organisationService: OrganisationService,
    private connectionService: ConnectionService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadConnections();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadDatasources();
    }
  }

  ngOnDestroy() {
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
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
          this.loadDatasources();
        } else {
          this.selectedOrg = null;
          this.datasources = [];
          this.selectedDatasource = null;
          this.connections = [];
          this.filteredConnections = [];
          this.totalRecords = 0;
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadDatasources();
  }

  onDBChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
    this.loadConnections();
  }

  onFilterChange() {
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      dbUsername: '',
      status: null,
      createdDateRange: null,
    };
    // Immediately reload without filters
    this.loadConnections();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadDatasources() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasourceService.listDatasource(params).then(
      response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasources = [...(response.data.datasources || [])];
          if (this.datasources.length > 0) {
            this.selectedDatasource = this.datasources[0].id;
            this.loadConnections();
          } else {
            this.selectedDatasource = null;
            this.connections = [];
            this.filteredConnections = [];
            this.totalRecords = 0;
          }
        } else {
          this.selectedDatasource = null;
          this.datasources = [];
          this.connections = [];
          this.filteredConnections = [];
          this.totalRecords = 0;
        }
      },
      error => {
        this.selectedDatasource = null;
        this.datasources = [];
        this.connections = [];
        this.filteredConnections = [];
        this.totalRecords = 0;
      },
    );
  }

  loadConnections(event?: any) {
    if (!this.selectedDatasource) return;

    // Store the event for future reloads
    if (event) {
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
      datasourceId: this.selectedDatasource,
      page: page,
      limit: limit,
    };

    // Build filter object like list-super-admin
    const filter: any = {};
    if (this.filterValues.name) {
      filter.name = this.filterValues.name;
    }
    if (this.filterValues.description) {
      filter.description = this.filterValues.description;
    }
    if (this.filterValues.dbUsername) {
      filter.dbUsername = this.filterValues.dbUsername;
    }
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

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.connectionService.listConnection(params).then(
      (response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.connections = [...response.data.connections];
          this.filteredConnections = [...this.connections];
          this.totalRecords =
            response.data.totalItems || this.connections.length;
        } else {
          this.connections = [];
          this.filteredConnections = [];
          this.totalRecords = 0;
        }
      },
      error => {
        this.connections = [];
        this.filteredConnections = [];
        this.totalRecords = 0;
      },
    );
  }

  onAddNewConnection() {
    this.router.navigate([CONNECTION.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([CONNECTION.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.tabToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.tabToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.tabToDelete && this.deleteJustification.trim()) {
      this.connectionService
        .deleteConnection(
          this.selectedOrg,
          this.tabToDelete,
          this.deleteJustification.trim(),
        )
        .then(response => {
          this.showDeleteConfirm = false;
          this.tabToDelete = null;
          this.deleteJustification = '';
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadConnections(this.lastTableLazyLoadEvent);
            }
          }
        });
    }
  }

  onEditTab(tab: any) {
    this.router.navigate([
      CONNECTION.EDIT,
      this.selectedOrg.id,
      ,
      this.selectedDatasource.id,
      tab.id,
    ]);
  }
}
