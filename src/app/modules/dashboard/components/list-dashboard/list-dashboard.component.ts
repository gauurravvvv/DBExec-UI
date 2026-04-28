import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { DASHBOARD as DB_ROUTES } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../services/dashboard.service';

@Component({
  selector: 'app-list-dashboard',
  templateUrl: './list-dashboard.component.html',
  styleUrls: ['./list-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDashboardComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  limit = 10;
  lastTableLazyLoadEvent: any;

  // Signal refs from service
  dashboards = this.dashboardService.dashboards;
  totalRecords = this.dashboardService.total;
  loading = this.dashboardService.loading;
  saving = this.dashboardService.saving;

  selectedDashboards: any[] = [];

  showDeleteConfirm = false;
  dashboardToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  organisations: any[] = [];
  datasources: any[] = [];
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;

  today = new Date();

  statusOptions: any[] = [];

  filterValues: any = {
    name: '',
    analysisName: '',
    datasetName: '',
    datasourceName: '',
    status: null,
    createdDateRange: null,
  };

  private filter$ = new Subject<void>();

  get selectedCount(): number {
    return this.selectedDashboards?.length || 0;
  }

  isRowSelectable = (event: any) => true;

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
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
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

  loadOrganisations(): Promise<void> {
    return new Promise(resolve => {
      const params = {
        page: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      };

      this.organisationService
        .listOrganisation(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            this.organisations = response.data.orgs || [];
            if (this.organisations.length > 0) {
              this.selectedOrg = this.organisations[0].id;
              this.loadDatasources();
            } else {
              this.selectedOrg = null;
              this.datasources = [];
              this.selectedDatasource = null;
            }
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
          this.cdr.markForCheck();
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
    this.selectedDashboards = [];
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
            this.datasources = response.data.datasources || [];
            if (this.datasources.length > 0) {
              this.selectedDatasource = this.datasources[0].id;
              this.loadDashboards();
            } else {
              this.selectedDatasource = null;
            }
          } else {
            this.selectedOrg = null;
            this.datasources = [];
            this.selectedDatasource = null;
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
          this.selectedOrg = null;
          this.datasources = [];
          this.selectedDatasource = null;
          this.cdr.markForCheck();
          resolve();
        });
    });
  }

  loadDashboards(event?: any) {
    if (!this.selectedOrg || !this.selectedDatasource) return;

    // Clear selection when page/sort changes
    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (
        prev &&
        (prev.first !== event.first ||
          prev.rows !== event.rows ||
          prev.sortField !== event.sortField ||
          prev.sortOrder !== event.sortOrder)
      ) {
        this.selectedDashboards = [];
      }
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

    this.dashboardService.load(params).catch(() => {});
  }

  onView(id: string) {
    this.router.navigate([DB_ROUTES.VIEW, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.dashboardToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.dashboardToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.dashboardToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedDashboards.map(d => d.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.dashboardService
        .bulkDelete(ids, reason, this.selectedOrg)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedDashboards = [];
            this.cdr.markForCheck();
            this.loadDashboards();
          }
        })
        .catch(() => {})
        .finally(() => {
          this.closeDeletePopup();
          this.cdr.markForCheck();
        });
      return;
    }

    if (this.dashboardToDelete) {
      this.dashboardService
        .delete(this.selectedOrg, this.dashboardToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedDashboards = this.selectedDashboards.filter(
              d => d.id !== this.dashboardToDelete,
            );
            this.cdr.markForCheck();
            this.loadDashboards();
          }
        })
        .catch(() => {})
        .finally(() => {
          this.closeDeletePopup();
          this.cdr.markForCheck();
        });
      return;
    }
    this.closeDeletePopup();
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.dashboardToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }
}
