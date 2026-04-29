import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { ANALYSES, DATASET } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { AnalysisFormData } from 'src/app/modules/analyses/components/save-analyses-dialog/save-analyses-dialog.component';
import { AnalysesService } from 'src/app/modules/analyses/services/analyses.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { QueryBuilderService } from 'src/app/modules/query-builder/services/query-builder.service';
import { TranslateService } from '@ngx-translate/core';
import { DatasetService } from '../../services/dataset.service';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';

@Component({
  selector: 'app-list-dataset',
  templateUrl: './list-dataset.component.html',
  styleUrls: ['./list-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDatasetComponent implements OnInit {
  @ViewChild('dt') dt!: Table;
  @ViewChild('qbSearchInput') qbSearchInput!: ElementRef;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  datasets: any[] = [];
  filteredDatasets: any[] = [];

  selectedDatasets: any[] = [];
  showDeleteConfirm = false;
  bulkDelete = false;
  deleteJustification = '';
  datasetToDelete: string | null = null;
  showDuplicateDialog = false;
  datasetToDuplicate: any = null;
  activeDataset: any = null;
  showQueryBuilderPopup = false;
  queryBuilders: any[] = [];
  loadingQueryBuilders = false;
  qbSearchTerm = '';
  qbTotalRecords = 0;
  qbActiveIndex = -1;
  organisations: any[] = [];
  datasources: any[] = [];
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
  saving = this.datasetService.saving;

  today = new Date();

  statusOptions: any[] = [];

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    status: null,
    createdDateRange: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();

  // Debouncing for QB search
  private qbFilter$ = new Subject<void>();

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  get selectedCount(): number {
    return this.selectedDatasets?.length || 0;
  }

  isRowSelectable = (event: any) => true;

  trackById(index: number, item: any): any {
    return item.id;
  }

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  addDatasetItems: MenuItem[] = [];

  // Create Analysis dialog
  showCreateAnalysisDialog = false;
  analysisDatasetId: string = '';

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private datasourceService: DatasourceService,
    private queryBuilderService: QueryBuilderService,
    private analysesService: AnalysesService,
    private route: ActivatedRoute,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.addDatasetItems = [
      {
        label: this.translate.instant('DATASET.VIA_QUERY_BUILDER'),
        icon: 'pi pi-comments',
        command: () => this.onAddViaPrompts(),
      },
    ];

    // Setup debounced filter
    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadDatasets();
      });

    // Setup debounced QB search
    this.qbFilter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadQueryBuilders();
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
                this.loadDatasources();
              }
            } else {
              this.selectedOrg = null;
              this.datasources = [];
              this.selectedDatasource = null;
              this.datasets = [];
              this.filteredDatasets = [];
              this.totalRecords = 0;
            }
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
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
    this.loadDatasets();
  }

  onFilterChange() {
    this.selectedDatasets = [];
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      status: null,
      createdDateRange: null,
    };
    // Immediately reload without filters
    this.loadDatasets();
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
        pageNumber: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      };

      this.datasourceService
        .listDatasource(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            this.datasources = response.data.datasources || [];
            if (this.datasources.length > 0) {
              if (
                preSelectedDbId &&
                this.datasources.find(d => d.id === preSelectedDbId)
              ) {
                this.selectedDatasource = preSelectedDbId;
              } else {
                this.selectedDatasource = this.datasources[0].id;
              }
              this.loadDatasets();
            } else {
              this.selectedDatasource = null;
              this.datasets = [];
              this.filteredDatasets = [];
              this.totalRecords = 0;
            }
          } else {
            this.selectedOrg = null;
            this.datasources = [];
            this.selectedDatasource = null;
            this.datasets = [];
            this.filteredDatasets = [];
            this.totalRecords = 0;
          }
          this.cdr.markForCheck();
          resolve();
        })
        .catch(() => {
          this.selectedOrg = null;
          this.datasources = [];
          this.selectedDatasource = null;
          this.datasets = [];
          this.filteredDatasets = [];
          this.totalRecords = 0;
          this.cdr.markForCheck();
          resolve();
        });
    });
  }

  loadDatasets(event?: any) {
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
        this.selectedDatasets = [];
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

    this.datasetService
      .listDatasets(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasets = response.data.datasets || [];
          this.filteredDatasets = [...this.datasets];
          this.totalRecords = response.data.totalItems || this.datasets.length;
        } else {
          this.datasets = [];
          this.filteredDatasets = [];
          this.totalRecords = 0;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.datasets = [];
        this.filteredDatasets = [];
        this.totalRecords = 0;
        this.cdr.markForCheck();
      });
  }

  onAddNewAdmin() {
    this.router.navigate([DATASET.ADD]);
  }

  onAddViaPrompts() {
    this.qbSearchTerm = '';
    this.qbActiveIndex = -1;
    this.showQueryBuilderPopup = true;
    this.loadQueryBuilders();
    setTimeout(() => this.qbSearchInput?.nativeElement?.focus());
  }

  closeQueryBuilderPopup() {
    this.showQueryBuilderPopup = false;
    this.qbSearchTerm = '';
    this.qbActiveIndex = -1;
  }

  onQbSearch() {
    this.qbActiveIndex = -1;
    this.qbFilter$.next();
  }

  onQbKeydown(event: KeyboardEvent) {
    const len = this.queryBuilders.length;
    if (!len) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.qbActiveIndex =
        this.qbActiveIndex < len - 1 ? this.qbActiveIndex + 1 : 0;
      this.scrollQbActiveIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.qbActiveIndex =
        this.qbActiveIndex > 0 ? this.qbActiveIndex - 1 : len - 1;
      this.scrollQbActiveIntoView();
    } else if (event.key === 'Enter' && this.qbActiveIndex >= 0) {
      event.preventDefault();
      this.onQueryBuilderSelect(this.queryBuilders[this.qbActiveIndex]);
    } else if (event.key === 'Escape') {
      this.closeQueryBuilderPopup();
    }
  }

  private scrollQbActiveIntoView() {
    setTimeout(() => {
      const el = document.querySelector('.cmd-row.active');
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  private loadQueryBuilders() {
    if (!this.selectedOrg || !this.selectedDatasource) return;

    this.loadingQueryBuilders = true;
    const params: any = {
      orgId: this.selectedOrg,
      datasourceId: this.selectedDatasource,
      page: 1,
      limit: MAX_LIMIT,
    };

    const term = this.qbSearchTerm.trim();
    if (term) {
      params.filter = JSON.stringify({ name: term });
    }

    this.queryBuilderService
      .listQueryBuilder(params)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.queryBuilders = response.data?.queryBuilders || [];
          this.qbTotalRecords =
            response.data?.count || this.queryBuilders.length;
        } else {
          this.queryBuilders = [];
          this.qbTotalRecords = 0;
        }
        this.loadingQueryBuilders = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.queryBuilders = [];
        this.qbTotalRecords = 0;
        this.loadingQueryBuilders = false;
        this.cdr.markForCheck();
      });
  }

  onQueryBuilderSelect(queryBuilder: any) {
    this.showQueryBuilderPopup = false;
    this.router.navigate([
      '/app/query-builder/execute',
      this.selectedOrg,
      this.selectedDatasource,
      queryBuilder.id,
    ]);
  }

  onEdit(id: string) {
    this.router.navigate([DATASET.EDIT, this.selectedOrg, id]);
  }

  useAsAnalysis(id: string) {
    this.analysisDatasetId = id;
    this.showCreateAnalysisDialog = true;
  }

  onCreateAnalysisDialogClose(result: AnalysisFormData | null) {
    if (result && this.analysisDatasetId) {
      this.analysesService
        .addAnalyses({
          name: result.name,
          description: result.description,
          datasetId: this.analysisDatasetId,
          organisation: this.selectedOrg,
          datasource: this.selectedDatasource,
        })
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response, true)) {
            this.router.navigate([ANALYSES.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
    this.showCreateAnalysisDialog = false;
    this.analysisDatasetId = '';
  }

  confirmDuplicate(dataset: any) {
    this.datasetToDuplicate = dataset;
    this.showDuplicateDialog = true;
  }

  onDuplicateDialogClose(result: DatasetFormData | null) {
    if (result && this.datasetToDuplicate) {
      this.datasetService
        .duplicateDataset(
          this.selectedOrg,
          this.datasetToDuplicate.id,
          result.name,
          result.description,
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadDatasets();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
    this.showDuplicateDialog = false;
    this.datasetToDuplicate = null;
  }

  confirmDelete(id: string) {
    this.datasetToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.datasetToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.datasetToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedDatasets.map((d: any) => d.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.datasetService
        .bulkDeleteDataset(ids, reason, this.selectedOrg)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedDatasets = [];
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.datasetToDelete) {
      this.datasetService
        .deleteDataset(this.selectedOrg, this.datasetToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedDatasets = this.selectedDatasets.filter(
              (d: any) => d.id !== this.datasetToDelete,
            );
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.datasetToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadDatasets(this.lastTableLazyLoadEvent);
    } else {
      this.loadDatasets();
    }
  }
}
