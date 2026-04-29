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
import { SECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TranslateService } from '@ngx-translate/core';
import { SectionService } from '../../services/section.service';

@Component({
  selector: 'app-list-section',
  templateUrl: './list-section.component.html',
  styleUrls: ['./list-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSectionComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  // Pagination limit for sections
  limit = 10;
  lastTableLazyLoadEvent: any;

  selectedSections: any[] = [];
  searchTerm: string = '';
  showDeleteConfirm = false;
  sectionToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  Math = Math;
  organisations: any[] = [];
  datasources: any[] = [];
  sections = this.sectionService.sections;
  total = this.sectionService.total;
  loading = this.sectionService.loading;
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
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
    tabName: '',
    status: null,
    createdDateRange: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();

  get selectedCount(): number {
    return this.selectedSections?.length || 0;
  }

  isRowSelectable = (event: any) => true;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      !!this.filterValues.tabName ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private datasourceService: DatasourceService,
    private sectionService: SectionService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadSections();
      });

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        if (params['orgId'] || params['datasourceId'] || params['name']) {
          this.handleDeepLinking(params);
        } else {
          if (this.showOrganisationDropdown) {
            this.loadOrganisations();
          } else {
            this.selectedOrg =
              this.globalService.getTokenDetails('organisationId');
            this.loadDatasources();
          }
        }
      });
  }

  handleDeepLinking(params: any) {
    const orgId = params['orgId'] ? params['orgId'] : null;
    const datasourceId = params['datasourceId'] ? params['datasourceId'] : null;
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
          if (datasourceId) {
            this.loadDatasources(datasourceId);
          } else {
            this.loadDatasources();
          }
        }
      });
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');

      if (datasourceId) {
        this.loadDatasources(datasourceId);
      } else {
        this.loadDatasources();
      }
    }
  }

  loadOrganisations(preSelectedOrgId?: string): Promise<void> {
    return new Promise(resolve => {
      const params = {
        page: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      };
      this.organisationService
        .listOrganisation(params)
        .then(response => {
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
                this.loadDatasources();
              }
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
        });
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadDatasources();
  }

  onDBChange(datasourceId: any) {
    this.selectedDatasource = datasourceId;
    this.loadSections();
  }

  onFilterChange() {
    this.selectedSections = [];
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      tabName: '',
      status: null,
      createdDateRange: null,
    };
    this.selectedSections = [];
    this.loadSections();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadDatasources(preSelectedDbId?: string): Promise<void> {
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
            this.datasources = [...(response.data.datasources || [])];
            if (this.datasources.length > 0) {
              if (
                preSelectedDbId &&
                this.datasources.find(d => d.id === preSelectedDbId)
              ) {
                this.selectedDatasource = preSelectedDbId;
              } else {
                this.selectedDatasource = this.datasources[0].id;
              }
              this.loadSections();
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

  loadSections(event?: any) {
    if (!this.selectedDatasource) return;

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
        this.selectedSections = [];
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

    this.sectionService.load(params);
  }

  onAddNewSection() {
    this.router.navigate([SECTION.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([SECTION.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.sectionToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.sectionToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.sectionToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedSections.map(s => s.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.sectionService
        .bulkDeleteSection(ids, reason, this.selectedOrg)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedSections = [];
            this.refreshList();
          }
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.sectionToDelete) {
      this.sectionService
        .delete(this.selectedOrg, this.sectionToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedSections = this.selectedSections.filter(
              s => s.id !== this.sectionToDelete,
            );
            this.refreshList();
          }
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.sectionToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadSections(this.lastTableLazyLoadEvent);
    } else {
      this.loadSections();
    }
  }

  onEditSection(section: any) {
    this.router.navigate([SECTION.EDIT, this.selectedOrg, section.id]);
  }
}
