import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GROUP } from 'src/app/constants/routes';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { GroupService } from '../../services/group.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-group',
  templateUrl: './list-group.component.html',
  styleUrls: ['./list-group.component.scss'],
})
export class ListGroupComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  groups: any[] = [];
  filteredGroups: any[] = [];

  showDeleteConfirm = false;
  groupToDelete: string | null = null;
  organisations: any[] = [];
  selectedOrg: any = null;
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

  constructor(
    private groupService: GroupService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadGroups();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadGroups();
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
        this.organisations = [...response.data.orgs];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          // Trigger load after org is selected
          this.loadGroups();
        } else {
          this.selectedOrg = null;
          this.groups = [];
          this.filteredGroups = [];
          this.totalRecords = 0;
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadGroups();
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
    this.loadGroups();
  }

  loadGroups(event?: any) {
    if (!this.selectedOrg) return;

    // Store the event for future reloads
    if (event) {
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
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

    this.groupService
      .listGroupps(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.groups = response.data.groups || [];
          this.filteredGroups = [...this.groups];
          this.totalRecords = response.data.totalItems || this.groups.length;
        } else {
          this.groups = [];
          this.filteredGroups = [];
          this.totalRecords = 0;
        }
      })
      .catch(() => {
        this.groups = [];
        this.filteredGroups = [];
        this.totalRecords = 0;
      });
  }

  onAddNewCategory() {
    this.router.navigate([GROUP.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([GROUP.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.groupToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
  }

  proceedDelete() {
    if (this.groupToDelete) {
      this.groupService
        .deleteGroup(this.selectedOrg, this.groupToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            if (this.lastTableLazyLoadEvent) {
              this.loadGroups(this.lastTableLazyLoadEvent);
            }
            this.showDeleteConfirm = false;
            this.groupToDelete = null;
          }
        });
    }
  }
}
