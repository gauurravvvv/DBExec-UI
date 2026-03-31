import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DASHBOARD as DB_ROUTES } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { DashboardService } from '../../services/dashboard.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-dashboard',
  templateUrl: './list-dashboard.component.html',
  styleUrls: ['./list-dashboard.component.scss'],
})
export class ListDashboardComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  dashboards: any[] = [];

  showDeleteConfirm = false;
  dashboardToDelete: string | null = null;
  deleteJustification = '';
  organisations: any[] = [];
  databases: any[] = [];
  selectedOrg: any = null;
  selectedDatabase: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;

  today = new Date();

  filterValues: any = {
    name: '',
    analysisName: '',
    datasetName: '',
    databaseName: '',
    createdDateRange: null,
  };

  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.analysisName ||
      !!this.filterValues.datasetName ||
      !!this.filterValues.databaseName ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private dashboardService: DashboardService,
    private databaseService: DatabaseService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadDashboards();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg =
        this.globalService.getTokenDetails('organisationId');
      this.loadDatabases();
    }
  }

  ngOnDestroy() {
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
    }
  }

  loadOrganisations(): Promise<void> {
    return new Promise(resolve => {
      const params = {
        page: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      };

      this.organisationService.listOrganisation(params).then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = response.data.orgs || [];
          if (this.organisations.length > 0) {
            this.selectedOrg = this.organisations[0].id;
            this.loadDatabases();
          } else {
            this.selectedOrg = null;
            this.databases = [];
            this.selectedDatabase = null;
            this.dashboards = [];
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
    this.loadDashboards();
  }

  onFilterChange() {
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      analysisName: '',
      datasetName: '',
      databaseName: '',
      createdDateRange: null,
    };
    this.loadDashboards();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadDatabases(): Promise<void> {
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
            this.databases = response.data.databases || [];
            if (this.databases.length > 0) {
              this.selectedDatabase = this.databases[0].id;
              this.loadDashboards();
            } else {
              this.selectedDatabase = null;
              this.dashboards = [];
              this.totalRecords = 0;
            }
          } else {
            this.selectedOrg = null;
            this.databases = [];
            this.selectedDatabase = null;
            this.dashboards = [];
            this.totalRecords = 0;
          }
          resolve();
        })
        .catch(() => {
          this.selectedOrg = null;
          this.databases = [];
          this.selectedDatabase = null;
          this.dashboards = [];
          this.totalRecords = 0;
          resolve();
        });
    });
  }

  loadDashboards(event?: any) {
    if (!this.selectedOrg || !this.selectedDatabase) return;

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

    const filter: any = {};
    if (this.filterValues.name) {
      filter.name = this.filterValues.name;
    }
    if (this.filterValues.analysisName) {
      filter.analysisName = this.filterValues.analysisName;
    }
    if (this.filterValues.datasetName) {
      filter.datasetName = this.filterValues.datasetName;
    }
    if (this.filterValues.databaseName) {
      filter.databaseName = this.filterValues.databaseName;
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

    this.dashboardService
      .listDashboards(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.dashboards = response.data.dashboards || [];
          this.totalRecords = response.data.count || this.dashboards.length;
        } else {
          this.dashboards = [];
          this.totalRecords = 0;
        }
      })
      .catch(() => {
        this.dashboards = [];
        this.totalRecords = 0;
      });
  }

  onView(id: string) {
    this.router.navigate([DB_ROUTES.VIEW, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.dashboardToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.dashboardToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.dashboardToDelete && this.deleteJustification.trim()) {
      this.dashboardService
        .deleteDashboard(
          this.selectedOrg,
          this.dashboardToDelete,
          this.deleteJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadDashboards();
            this.showDeleteConfirm = false;
            this.dashboardToDelete = null;
            this.deleteJustification = '';
          }
        });
    }
  }
}
