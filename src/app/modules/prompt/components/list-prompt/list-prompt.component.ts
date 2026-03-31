import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { PROMPT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { PromptService } from '../../services/prompt.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-prompt',
  templateUrl: './list-prompt.component.html',
  styleUrls: ['./list-prompt.component.scss'],
})
export class ListPromptComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  // Pagination limit for prompts
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  filteredPrompts: any[] = [];

  searchTerm: string = '';
  showDeleteConfirm = false;
  promptToDelete: string | null = null;
  deleteJustification = '';
  Math = Math;
  organisations: any[] = [];
  datasources: any[] = [];
  prompts: any[] = [];
  selectedOrg: any = null;
  selectedDatasource: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
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
    sectionName: '',
    type: '',
    status: null,
    createdDateRange: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      !!this.filterValues.tabName ||
      !!this.filterValues.sectionName ||
      !!this.filterValues.type ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private datasourceService: DatasourceService,
    private organisationService: OrganisationService,
    private promptService: PromptService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadPrompts();
      });

    this.route.queryParams.subscribe(params => {
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

  ngOnDestroy() {
    if (this.filterSubscription) {
      this.filterSubscription.unsubscribe();
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
          this.organisations = response.data.orgs;
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
            this.prompts = [];
            this.filteredPrompts = [];
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
    this.loadPrompts();
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
      sectionName: '',
      type: '',
      status: null,
      createdDateRange: null,
    };
    this.loadPrompts();
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
            this.datasources = response.data.databases || [];
            if (this.datasources.length > 0) {
              if (
                preSelectedDbId &&
                this.datasources.find(d => d.id === preSelectedDbId)
              ) {
                this.selectedDatasource = preSelectedDbId;
              } else {
                this.selectedDatasource = this.datasources[0].id;
              }
              this.loadPrompts();
            } else {
              this.selectedDatasource = null;
              this.prompts = [];
              this.filteredPrompts = [];
              this.totalRecords = 0;
            }
          } else {
            this.selectedOrg = null;
            this.datasources = [];
            this.selectedDatasource = null;
            this.prompts = [];
            this.filteredPrompts = [];
            this.totalRecords = 0;
          }
          resolve();
        })
        .catch(() => {
          this.selectedOrg = null;
          this.datasources = [];
          this.selectedDatasource = null;
          this.prompts = [];
          this.filteredPrompts = [];
          this.totalRecords = 0;
          resolve();
        });
    });
  }

  loadPrompts(event?: any) {
    if (!this.selectedDatasource) return;

    // Store the event for future reloads
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
    if (this.filterValues.sectionName) {
      filter.sectionName = this.filterValues.sectionName;
    }

    if (this.filterValues.type) {
      filter.type = this.filterValues.type;
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

    this.promptService
      .listPrompt(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.prompts = response.data?.prompts || [];
          this.filteredPrompts = [...this.prompts];
          this.totalRecords = response.data?.count;
        } else {
          this.prompts = [];
          this.filteredPrompts = [];
          this.totalRecords = 0;
        }
      })
      .catch(() => {
        this.prompts = [];
        this.filteredPrompts = [];
        this.totalRecords = 0;
      });
  }

  onAddNewPrompt() {
    this.router.navigate([PROMPT.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([PROMPT.EDIT, this.selectedOrg, id]);
  }

  onConfig(id: string) {
    this.router.navigate([PROMPT.CONFIG, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.promptToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.promptToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.promptToDelete && this.deleteJustification.trim()) {
      this.promptService
        .deletePrompt(
          this.selectedOrg,
          this.promptToDelete,
          this.deleteJustification.trim(),
        )
        .then(response => {
          this.showDeleteConfirm = false;
          this.promptToDelete = null;
          this.deleteJustification = '';
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadPrompts(this.lastTableLazyLoadEvent);
            } else {
              this.loadPrompts();
            }
          }
        });
    }
  }
}
