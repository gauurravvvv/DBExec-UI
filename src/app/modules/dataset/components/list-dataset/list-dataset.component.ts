import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
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
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-dataset',
  templateUrl: './list-dataset.component.html',
  styleUrls: ['./list-dataset.component.scss'],
})
export class ListDatasetComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  datasets: any[] = [];
  filteredDatasets: any[] = [];

  showDeleteConfirm = false;
  datasetToDelete: string | null = null;
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

  get isFilterActive(): boolean {
    return !!this.filterValues.name || !!this.filterValues.description;
  }

  addDatasetItems: MenuItem[] = [
    {
      label: 'via Prompts',
      icon: 'pi pi-comments',
      command: () => this.onAddViaPrompts(),
    },
  ];

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private datasetService: DatasetService,
    private databaseService: DatabaseService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadDatasets();
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
        this.organisations = response.data.orgs || [];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadDatabases();
        } else {
          this.selectedOrg = null;
          this.databases = [];
          this.selectedDatabase = null;
          this.datasets = [];
          this.totalRecords = 0;
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

  loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      pageNumber: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = response.data || [];
        if (this.databases.length > 0) {
          this.selectedDatabase = this.databases[0].id;
          this.loadDatasets();
        } else {
          this.selectedDatabase = null;
          this.datasets = [];
          this.filteredDatasets = [];
          this.totalRecords = 0;
        }
      }
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

    this.datasetService.listDatasets(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasets = response.data.datasets || [];
        this.filteredDatasets = [...this.datasets];
        this.totalRecords = response.data.totalItems || this.datasets.length;
      }
    });
  }

  onAddNewAdmin() {
    this.router.navigate([DATASET.ADD]);
  }

  onAddViaPrompts() {
    console.log('Add Dataset via Prompts clicked');
  }

  onEdit(id: string) {
    this.router.navigate([DATASET.EDIT, this.selectedOrg, id]);
  }

  useAsAnalysis(id: string) {
    this.router.navigate([ANALYSES.ADD, this.selectedOrg, id]);
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
