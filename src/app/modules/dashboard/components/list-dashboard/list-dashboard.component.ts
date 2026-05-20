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
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { DASHBOARD as DB_ROUTES } from 'src/app/core/constants/routes.constant';
import { ROLES } from 'src/app/core/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../services/dashboard.service';

type DashboardSortField = 'name' | 'status' | 'createdOn';

@Component({
  selector: 'app-list-dashboard',
  templateUrl: './list-dashboard.component.html',
  styleUrls: ['./list-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDashboardComponent implements OnInit {
  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadDashboards();
    }
  }

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
  sortHelper = new ListSortHelper<DashboardSortField>();

  showDeleteConfirm = false;
  dashboardToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  organisations: any[] = [];
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;

  today = new Date();

  statusOptions: any[] = [];

  filterValues: any = {
    name: '',
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

  loadOrgsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any =
        await this.organisationService.listOrganisation(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.orgs ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadOrganisations(): Promise<void> {
    return new Promise(resolve => {
      this.organisationService
        .listOrganisation({ page: DEFAULT_PAGE, limit: 10 })
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            const orgs = response?.data?.orgs ?? [];
            this.preloadedOrgs = orgs;
            this.preloadedOrgsTotal = response?.data?.count ?? orgs.length;
            if (orgs.length > 0) {
              this.selectedOrg = orgs[0].id;
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
    this.preloadedDatasources = null;
    this.preloadedDatasourcesTotal = null;
    this.loadDatasources();
  }

  /**
   * Fetcher for the server-mode datasource dropdown. Org-scoped — no-ops
   * gracefully if no org is selected.
   */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    if (!this.selectedOrg) return { items: [], total: 0 };
    const params: any = { orgId: this.selectedOrg, page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

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
        limit: 10,
      };

      this.datasourceService
        .listDatasource(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            const items = response?.data?.datasources ?? [];
            this.preloadedDatasources = items;
            this.preloadedDatasourcesTotal =
              response?.data?.count ?? items.length;
            this.datasources = items;
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

  toggleSort(field: DashboardSortField) {
    this.sortHelper.toggle(field);
    this.selectedDashboards = [];
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
    }
    this.loadDashboards(this.lastTableLazyLoadEvent);
  }

  loadDashboards(event?: any) {
    if (!this.selectedOrg || !this.selectedDatasource) return;

    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (prev && (prev.first !== event.first || prev.rows !== event.rows)) {
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

    const sortParam = this.sortHelper.serialize();
    if (sortParam) params.sort = sortParam;

    this.dashboardService.load(params).catch(() => {});
  }

  onView(id: string) {
    this.router.navigate([DB_ROUTES.view(this.selectedOrg, id)]);
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
