import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { SECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { SectionService } from '../../services/section.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-section',
  templateUrl: './list-section.component.html',
  styleUrls: ['./list-section.component.scss'],
})
export class ListSectionComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  // Pagination limit for sections
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  filteredSections: any[] = [];

  searchTerm: string = '';
  showDeleteConfirm = false;
  sectionToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  sections: any[] = [];
  selectedOrg: any = null;
  selectedDatabase: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    tabName: '',
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      !!this.filterValues.tabName
    );
  }

  constructor(
    private databaseService: DatabaseService,
    private sectionService: SectionService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadSections();
      });

    this.route.queryParams.subscribe(params => {
      if (params['orgId'] || params['databaseId'] || params['name']) {
        this.handleDeepLinking(params);
      } else {
        if (this.showOrganisationDropdown) {
          this.loadOrganisations();
        } else {
          this.selectedOrg =
            this.globalService.getTokenDetails('organisationId');
          this.loadDatabases();
        }
      }
    });
  }

  handleDeepLinking(params: any) {
    const orgId = params['orgId'] ? Number(params['orgId']) : null;
    const databaseId = params['databaseId']
      ? Number(params['databaseId'])
      : null;
    const name = params['name'];

    if (name) {
      this.filterValues.name = name;
    }

    if (this.showOrganisationDropdown) {
      const orgPromise = orgId
        ? this.loadOrganisations(orgId)
        : this.loadOrganisations();

      orgPromise.then(() => {
        if (orgId) {
          if (databaseId) {
            this.loadDatabases(databaseId);
          } else {
            this.loadDatabases();
          }
        }
      });
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');

      if (databaseId) {
        this.loadDatabases(databaseId);
      } else {
        this.loadDatabases();
      }
    }
  }

  ngOnDestroy() {
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
    }
  }

  loadOrganisations(preSelectedOrgId?: number): Promise<void> {
    return new Promise(resolve => {
      const params = {
        page: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      };
      this.organisationService.listOrganisation(params).then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = [...response.data.orgs];
          if (this.organisations.length > 0) {
            if (
              preSelectedOrgId &&
              this.organisations.find(o => o.id === preSelectedOrgId)
            ) {
              this.selectedOrg = preSelectedOrgId;
            } else {
              this.selectedOrg = this.organisations[0].id;
            }

            if (!preSelectedOrgId) {
              this.loadDatabases();
            }
          }
        }
        resolve();
      });
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadDatabases();
  }

  onDBChange(databaseId: any) {
    this.selectedDatabase = databaseId;
    this.loadSections();
  }

  onFilterChange() {
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      tabName: '',
    };
    // Immediately reload without filters
    this.loadSections();
  }

  loadDatabases(preSelectedDbId?: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.selectedOrg) {
        resolve();
        return;
      }
      const params = {
        orgId: this.selectedOrg,
        page: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      };

      this.databaseService.listDatabase(params).then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.databases = [...response.data];
          if (this.databases.length > 0) {
            if (
              preSelectedDbId &&
              this.databases.find(d => d.id === preSelectedDbId)
            ) {
              this.selectedDatabase = preSelectedDbId;
            } else {
              this.selectedDatabase = this.databases[0].id;
            }
            this.loadSections();
          } else {
            this.selectedDatabase = null;
            this.sections = [];
            this.filteredSections = [];
          }
        }
        resolve();
      });
    });
  }

  loadSections(event?: any) {
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
    if (this.filterValues.tabName) {
      filter.tabName = this.filterValues.tabName;
    }

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.sectionService.listSection(params).then((response: any) => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.sections = response.data?.sections || [];
        this.filteredSections = [...this.sections];
        this.totalRecords = response.data?.count || this.sections.length;
      }
    });
  }

  onAddNewSection() {
    this.router.navigate([SECTION.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([SECTION.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.sectionToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.sectionToDelete = null;
  }

  proceedDelete() {
    if (this.sectionToDelete) {
      this.sectionService
        .deleteSection(this.selectedOrg, this.sectionToDelete)
        .then(response => {
          this.showDeleteConfirm = false;
          this.sectionToDelete = null;
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadSections(this.lastTableLazyLoadEvent);
            }
          }
        });
    }
  }

  onEditSection(section: any) {
    this.router.navigate([SECTION.EDIT, this.selectedOrg, section.id]);
  }
}
