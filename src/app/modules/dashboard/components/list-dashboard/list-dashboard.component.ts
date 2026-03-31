import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DASHBOARD as DB_ROUTES } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
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
  datasources: any[] = [];
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;

  today = new Date();

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

  filterValues: any = {
    name: '',
    analysisName: '',
    datasetName: '',
    datasourceName: '',
    status: null,
    createdDateRange: null,
  };

  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.analysisName ||
      !!this.filterValues.datasetName ||
      !!this.filterValues.datasourceName ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private dashboardService: DashboardService,
    private datasourceService: DatasourceService,
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
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadDatasources();
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
            this.loadDatasources();
          } else {
            this.selectedOrg = null;
            this.datasources = [];
            this.selectedDatasource = null;
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
    this.loadDatasources();
  }

  onDBChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
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
      datasourceName: '',
      status: null,
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

  loadDatasources(): Promise<void> {
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

      this.datasourceService
        .listDatasource(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            this.datasources = response.data.databases || [];
            if (this.datasources.length > 0) {
              this.selectedDatasource = this.datasources[0].id;
              this.loadDashboards();
            } else {
              this.selectedDatasource = null;
              this.dashboards = [];
              this.totalRecords = 0;
            }
          } else {
            this.selectedOrg = null;
            this.datasources = [];
            this.selectedDatasource = null;
            this.dashboards = [];
            this.totalRecords = 0;
          }
          resolve();
        })
        .catch(() => {
          this.selectedOrg = null;
          this.datasources = [];
          this.selectedDatasource = null;
          this.dashboards = [];
          this.totalRecords = 0;
          resolve();
        });
    });
  }

  loadDashboards(event?: any) {
    if (!this.selectedOrg || !this.selectedDatasource) return;

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
    if (this.filterValues.datasourceName) {
      filter.datasourceName = this.filterValues.datasourceName;
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
