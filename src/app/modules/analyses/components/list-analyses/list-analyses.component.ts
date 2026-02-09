import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ANALYSES } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { AnalysesService } from '../../service/analyses.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-analyses',
  templateUrl: './list-analyses.component.html',
  styleUrls: ['./list-analyses.component.scss'],
})
export class ListAnalysesComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  analyses: any[] = [];
  filteredAnalyses: any[] = [];

  showDeleteConfirm = false;
  analysisToDelete: string | null = null;
  organisations: any[] = [];
  databases: any[] = [];
  selectedOrg: any = null;
  selectedDatabase: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    datasetName: '',
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      !!this.filterValues.datasetName
    );
  }

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private databaseService: DatabaseService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadAnalyses();
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
          this.organisations = response.data.orgs || [];
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
          } else {
            this.selectedOrg = null;
            this.databases = [];
            this.selectedDatabase = null;
            this.analyses = [];
            this.filteredAnalyses = [];
            this.totalRecords = 0;
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
    this.loadAnalyses();
  }

  onFilterChange() {
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      datasetName: '',
    };
    // Immediately reload without filters
    this.loadAnalyses();
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

      this.databaseService
        .listDatabase(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            this.databases = response.data || [];
            if (this.databases.length > 0) {
              if (
                preSelectedDbId &&
                this.databases.find(d => d.id === preSelectedDbId)
              ) {
                this.selectedDatabase = preSelectedDbId;
              } else {
                this.selectedDatabase = this.databases[0].id;
              }
              this.loadAnalyses();
            } else {
              this.selectedDatabase = null;
              this.analyses = [];
              this.filteredAnalyses = [];
              this.totalRecords = 0;
            }
          } else {
            this.selectedOrg = null;
            this.databases = [];
            this.selectedDatabase = null;
            this.analyses = [];
            this.filteredAnalyses = [];
            this.totalRecords = 0;
          }
          resolve();
        })
        .catch(() => {
          this.selectedOrg = null;
          this.databases = [];
          this.selectedDatabase = null;
          this.analyses = [];
          this.filteredAnalyses = [];
          this.totalRecords = 0;
          resolve();
        });
    });
  }

  loadAnalyses(event?: any) {
    if (!this.selectedOrg || !this.selectedDatabase) return;

    // Store the event for future reloads
    if (event) {
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
      databaseId: this.selectedDatabase,
      page: page, // The API expects 'page' not 'pageNumber' based on other components
      limit: limit,
    };

    // Build filter object (Note: Analysis API might need filter param handling if backend supports it)
    // Assuming backend supports 'filter' param like other list APIs
    const filter: any = {};
    if (this.filterValues.name) {
      filter.name = this.filterValues.name;
    }
    if (this.filterValues.description) {
      filter.description = this.filterValues.description;
    }
    if (this.filterValues.datasetName) {
      filter.datasetName = this.filterValues.datasetName;
    }

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.analysesService
      .listAnalyses(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analyses = response.data.analyses || [];
          this.filteredAnalyses = [...this.analyses];
          this.totalRecords = response.data.totalItems || this.analyses.length;
        } else {
          this.analyses = [];
          this.filteredAnalyses = [];
          this.totalRecords = 0;
        }
      })
      .catch(() => {
        this.analyses = [];
        this.filteredAnalyses = [];
        this.totalRecords = 0;
      });
  }

  onView(id: string) {
    this.router.navigate([ANALYSES.VIEW, this.selectedOrg, id]);
  }

  onEdit(id: string) {
    this.router.navigate([ANALYSES.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.analysisToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.analysisToDelete = null;
  }

  proceedDelete() {
    if (this.analysisToDelete) {
      this.analysesService
        .deleteAnalyses(this.selectedOrg, this.analysisToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadAnalyses();
            this.showDeleteConfirm = false;
            this.analysisToDelete = null;
          }
        });
    }
  }
}
