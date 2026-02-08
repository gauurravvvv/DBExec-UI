import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TAB } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TabService } from '../../services/tab.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-tab',
  templateUrl: './list-tab.component.html',
  styleUrls: ['./list-tab.component.scss'],
})
export class ListTabComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  // Pagination limit for tabs
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  filteredTabs: any[] = [];

  showDeleteConfirm = false;
  tabToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  tabs: any[] = [];
  selectedOrg: any = null;
  selectedDatabase: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return !!this.filterValues.name || !!this.filterValues.description;
  }

  constructor(
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private tabService: TabService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadTabs();
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
    this.loadTabs();
  }

  onFilterChange() {
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
    };
    // Immediately reload without filters
    this.loadTabs();
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
          this.loadTabs();
        } else {
          this.selectedDatabase = null;
          this.tabs = [];
          this.filteredTabs = [];
        }
      }
    });
  }

  loadTabs(event?: any) {
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

    // Build filter object
    const filter: any = {};
    if (this.filterValues.name) {
      filter.name = this.filterValues.name;
    }
    if (this.filterValues.description) {
      filter.description = this.filterValues.description;
    }

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.tabService.listTab(params).then((response: any) => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabs = response.data?.tabs || [];
        this.filteredTabs = [...this.tabs];
        this.totalRecords = response.data?.count || this.tabs.length;
      }
    });
  }

  onAddNewTab() {
    this.router.navigate([TAB.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([TAB.EDIT, this.selectedOrg, id]);
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
      this.tabService
        .deleteTab(this.selectedOrg, this.tabToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showDeleteConfirm = false;
            this.tabToDelete = null;
            if (this.lastTableLazyLoadEvent) {
              this.loadTabs(this.lastTableLazyLoadEvent);
            } else {
              this.loadTabs();
            }
          }
        });
    }
  }

  onEditTab(tab: any) {
    this.router.navigate([TAB.EDIT, this.selectedOrg, tab.id]);
  }
}
