import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { PROMPT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { PromptService } from '../../services/prompt.service';

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
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  prompts: any[] = [];
  selectedOrg: any = null;
  selectedDatabase: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
    tabName: '',
    sectionName: '',
    type: '',
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
      !!this.filterValues.type
    );
  }

  constructor(
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private promptService: PromptService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadPrompts();
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
      page: 1,
      limit: 10000,
    };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadDatabases();
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
    };
    if (this.dt) {
      this.dt.reset();
    }
    // Immediately reload without filters
    this.loadPrompts();
  }

  loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      pageNumber: 1,
      limit: 10000,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = response.data;
        if (this.databases.length > 0) {
          this.selectedDatabase = this.databases[0].id;
          this.loadPrompts();
        } else {
          this.selectedDatabase = null;
          this.prompts = [];
          this.filteredPrompts = [];
        }
      }
    });
  }

  loadPrompts(event?: any) {
    if (!this.selectedDatabase) return;

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
    if (this.filterValues.tabName) {
      filter.tabName = this.filterValues.tabName;
    }
    if (this.filterValues.sectionName) {
      filter.sectionName = this.filterValues.sectionName;
    }

    if (this.filterValues.type) {
      filter.type = this.filterValues.type;
    }

    // Add JSON stringified filter if any filter is set
    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    this.promptService.listPrompt(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.prompts = response.data?.prompts || [];
        this.filteredPrompts = [...this.prompts];
        this.totalRecords = response.data?.count;
      }
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
  }

  proceedDelete() {
    if (this.promptToDelete) {
      this.promptService
        .deletePrompt(this.selectedOrg, this.promptToDelete)
        .then(response => {
          this.showDeleteConfirm = false;
          this.promptToDelete = null;
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
