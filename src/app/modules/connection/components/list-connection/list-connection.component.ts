import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
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
  tabToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  connections: any[] = [];
  selectedOrg: any = null;
  selectedDatabase: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    dbUsername: '',
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      !!this.filterValues.dbUsername
    );
  }

  constructor(
    private databaseService: DatabaseService,
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
      this.loadDatabases();
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
          this.loadDatabases();
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadDatabases();
  }

  onDBChange(databaseId: any) {
    this.selectedDatabase = databaseId;
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
    };
    // Immediately reload without filters
    this.loadConnections();
  }

  loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = [...response.data];
        if (this.databases.length > 0) {
          this.selectedDatabase = this.databases[0].id;
          this.loadConnections();
        } else {
          this.selectedDatabase = null;
          this.connections = [];
          this.filteredConnections = [];
        }
      }
    });
  }

  loadConnections(event?: any) {
    if (!this.selectedDatabase) return;

    // Store the event for future reloads
    if (event) {
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
      databaseId: this.selectedDatabase,
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

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.connectionService.listConnection(params).then((response: any) => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.connections = [...response.data.connections];
        this.filteredConnections = [...this.connections];
        this.totalRecords = response.data.totalItems || this.connections.length;
      }
    });
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
  }

  proceedDelete() {
    if (this.tabToDelete) {
      this.connectionService
        .deleteConnection(this.selectedOrg, this.tabToDelete)
        .then(response => {
          this.showDeleteConfirm = false;
          this.tabToDelete = null;
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
      this.selectedDatabase.id,
      tab.id,
    ]);
  }
}
