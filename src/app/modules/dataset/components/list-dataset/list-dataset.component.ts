import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ANALYSES, DATASET } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasetService } from '../../services/dataset.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { ScreenService } from 'src/app/modules/screen/services/screen.service';
import { AnalysesService } from 'src/app/modules/analyses/service/analyses.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { DatasetFormData } from '../save-dataset-dialog/save-dataset-dialog.component';
import { AnalysisFormData } from 'src/app/modules/analyses/components/save-analyses-dialog/save-analyses-dialog.component';

@Component({
  selector: 'app-list-dataset',
  templateUrl: './list-dataset.component.html',
  styleUrls: ['./list-dataset.component.scss'],
})
export class ListDatasetComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;
  @ViewChild('qbSearchInput') qbSearchInput!: ElementRef;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  datasets: any[] = [];
  filteredDatasets: any[] = [];

  showDeleteConfirm = false;
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
  databases: any[] = [];
  selectedOrg: any = null;
  selectedDatabase: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  // Debouncing for QB search
  private qbFilter$ = new Subject<void>();
  private qbFilterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return !!this.filterValues.name || !!this.filterValues.description;
  }

  addDatasetItems: MenuItem[] = [
    {
      label: 'via Query Builder',
      icon: 'pi pi-comments',
      command: () => this.onAddViaPrompts(),
    },
  ];

  // Create Analysis dialog
  showCreateAnalysisDialog = false;
  analysisDatasetId: string = '';

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private databaseService: DatabaseService,
    private screenService: ScreenService,
    private analysesService: AnalysesService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadDatasets();
      });

    // Setup debounced QB search
    this.qbFilterSubscription = this.qbFilter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadQueryBuilders();
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
    const orgId = params['orgId'] ? params['orgId'] : null;
    const databaseId = params['databaseId']
      ? params['databaseId']
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
    if (this.qbFilterSubscription) {
      this.qbFilterSubscription.unsubscribe();
    }
  }

  loadOrganisations(preSelectedOrgId?: string): Promise<void> {
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
            this.datasets = [];
            this.filteredDatasets = [];
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
    this.loadDatasets();
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
    this.loadDatasets();
  }

  loadDatabases(preSelectedDbId?: string): Promise<void> {
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

      this.databaseService
        .listDatabase(params)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            this.databases = response.data.databases || [];
            if (this.databases.length > 0) {
              if (
                preSelectedDbId &&
                this.databases.find(d => d.id === preSelectedDbId)
              ) {
                this.selectedDatabase = preSelectedDbId;
              } else {
                this.selectedDatabase = this.databases[0].id;
              }
              this.loadDatasets();
            } else {
              this.selectedDatabase = null;
              this.datasets = [];
              this.filteredDatasets = [];
              this.totalRecords = 0;
            }
          } else {
            this.selectedOrg = null;
            this.databases = [];
            this.selectedDatabase = null;
            this.datasets = [];
            this.filteredDatasets = [];
            this.totalRecords = 0;
          }
          resolve();
        })
        .catch(() => {
          this.selectedOrg = null;
          this.databases = [];
          this.selectedDatabase = null;
          this.datasets = [];
          this.filteredDatasets = [];
          this.totalRecords = 0;
          resolve();
        });
    });
  }

  loadDatasets(event?: any) {
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
      })
      .catch(() => {
        this.datasets = [];
        this.filteredDatasets = [];
        this.totalRecords = 0;
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
    if (!this.selectedOrg || !this.selectedDatabase) return;

    this.loadingQueryBuilders = true;
    const params: any = {
      orgId: this.selectedOrg,
      databaseId: this.selectedDatabase,
      page: 1,
      limit: MAX_LIMIT,
    };

    const term = this.qbSearchTerm.trim();
    if (term) {
      params.filter = JSON.stringify({ name: term });
    }

    this.screenService
      .listScreen(params)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.queryBuilders = response.data?.screens || [];
          this.qbTotalRecords =
            response.data?.count || this.queryBuilders.length;
        } else {
          this.queryBuilders = [];
          this.qbTotalRecords = 0;
        }
        this.loadingQueryBuilders = false;
      })
      .catch(() => {
        this.queryBuilders = [];
        this.qbTotalRecords = 0;
        this.loadingQueryBuilders = false;
      });
  }

  onQueryBuilderSelect(screen: any) {
    this.showQueryBuilderPopup = false;
    this.router.navigate([
      '/app/screen/execute',
      this.selectedOrg,
      this.selectedDatabase,
      screen.id,
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
          database: this.selectedDatabase,
          visuals: [],
        })
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response, true)) {
            this.router.navigate([ANALYSES.LIST]);
          }
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
        });
    }
    this.showDuplicateDialog = false;
    this.datasetToDuplicate = null;
  }

  confirmDelete(id: string) {
    this.datasetToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.datasetToDelete = null;
  }

  proceedDelete() {
    if (this.datasetToDelete) {
      this.datasetService
        .deleteDataset(this.selectedOrg, this.datasetToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadDatasets();
            this.showDeleteConfirm = false;
            this.datasetToDelete = null;
          }
        });
    }
  }
}
