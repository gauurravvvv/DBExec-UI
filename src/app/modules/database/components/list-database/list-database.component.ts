import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DATABASE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatabaseService } from '../../services/database.service';

@Component({
  selector: 'app-list-database',
  templateUrl: './list-database.component.html',
  styleUrls: ['./list-database.component.scss'],
})
export class ListDatabaseComponent implements OnInit {
  @ViewChild('dt') dt!: Table;
  dbs: any[] = [];
  filteredDBs: any[] = [];
  listParams: any = {
    limit: 10,
    pageNumber: 1,
  };
  totalItems = 0;

  private searchSubject = new Subject<void>();
  lastTableLazyLoadEvent: any;

  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  selectedDatabase: any = null;
  showDeleteConfirm = false;
  deleteConfiguration: boolean = false;

  constructor(
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounce for filter changes
    this.searchSubject.pipe(debounceTime(500)).subscribe(() => {
      if (this.lastTableLazyLoadEvent) {
        this.loadDatabases(this.lastTableLazyLoadEvent);
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
      page: 1,
      limit: 10000,
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
            this.listDatabaseAPI(this.selectedOrg);
          }
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    // Reset table which triggers onLazyLoad -> loadDatabases
    if (this.dt) {
      this.dt.reset();
    }
  }

  filterValues: any = {
    name: '',
    description: '',
  };

  get isFilterActive(): boolean {
    return !!this.filterValues.name || !!this.filterValues.description;
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
    };
    this.onFilterChange();
  }

  onFilterChange() {
    this.searchSubject.next();
  }

  loadDatabases(event: any) {
    if (!event) return;
    this.lastTableLazyLoadEvent = event;
    const page = event.first / event.rows + 1;
    const limit = event.rows;

    this.listParams.pageNumber = page;
    this.listParams.limit = limit;

    this.listDatabaseAPI();
  }

  listDatabaseAPI(overrideOrgId?: any) {
    // Handle both object with .id property and primitive ID values
    let orgId = overrideOrgId || this.selectedOrg;
    if (typeof orgId === 'object' && orgId !== null) {
      orgId = orgId.id;
    }
    if (!orgId) return;

    const params: any = {
      orgId: orgId,
      pageNumber: this.listParams.pageNumber,
      limit: this.listParams.limit,
    };

    let filter: any = {};
    if (this.filterValues.name) filter.name = this.filterValues.name;
    if (this.filterValues.description)
      filter.description = this.filterValues.description;

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.databaseService.listAllDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.dbs = response.data.databases || [];
        this.totalItems = response.data.count || 0;
      }
    });
  }

  onAddNewDatabase() {
    this.router.navigate([DATABASE.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([DATABASE.EDIT + '/' + id]);
  }

  confirmDelete(database: any): void {
    this.selectedDatabase = database;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.selectedDatabase = null;
    this.deleteConfiguration = false;
  }

  proceedDelete() {
    if (this.selectedDatabase) {
      this.databaseService
        .deleteDatabase(
          this.selectedDatabase.organisationId,
          this.selectedDatabase.id,
          this.selectedDatabase.isMasterDB ? '1' : '0',
          this.deleteConfiguration,
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadDatabases(this.lastTableLazyLoadEvent);
            }
            this.showDeleteConfirm = false;
            this.selectedDatabase = null;
          }
        });
    }
  }
}
