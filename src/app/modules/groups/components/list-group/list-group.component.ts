import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GROUP } from 'src/app/constants/routes';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { RoleService } from 'src/app/modules/role/services/role.service';
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

  selectedGroups: any[] = [];

  showDeleteConfirm = false;
  groupToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  organisations: any[] = [];
  roles: any[] = [];
  selectedOrg: any = null;
  selectedRole: string | null = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  today = new Date();

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

  // Filter values for column filtering
  filterValues: any = {
    name: '',
    description: '',
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
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange ||
      !!this.selectedRole
    );
  }

  constructor(
    private groupService: GroupService,
    private organisationService: OrganisationService,
    private roleService: RoleService,
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
      this.loadRoles();
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
          this.loadRoles();
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

  loadRoles() {
    if (!this.selectedOrg) return;
    this.roleService.listRoles(this.selectedOrg).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.roles = response.data.roles || [];
      }
    });
  }

  get selectedCount(): number {
    return this.selectedGroups?.length || 0;
  }

  isRowSelectable = (event: any) => true;

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.selectedRole = null;
    this.selectedGroups = [];
    this.roles = [];
    this.loadRoles();
    this.loadGroups();
  }

  onRoleChange(roleId: string | null) {
    this.selectedRole = roleId;
    this.loadGroups();
  }

  onFilterChange() {
    this.selectedGroups = [];
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
    this.selectedRole = null;
    // Immediately reload without filters
    this.loadGroups();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadGroups(event?: any) {
    if (!this.selectedOrg) return;

    // Store the event for future reloads
    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (
        prev &&
        (prev.first !== event.first ||
          prev.rows !== event.rows ||
          prev.sortField !== event.sortField ||
          prev.sortOrder !== event.sortOrder)
      ) {
        this.selectedGroups = [];
      }
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
      page: page,
      limit: limit,
    };

    if (this.selectedRole) {
      params.roleId = this.selectedRole;
    }

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

    this.groupService
      .listGroups(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.groups = response.data.groups || [];
          this.filteredGroups = [...this.groups];
          this.totalRecords = response.data.count || this.groups.length;
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
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.groupToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedGroups.map(g => g.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.groupService
        .bulkDeleteGroup(ids, reason, this.selectedOrg)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedGroups = [];
            this.refreshList();
          }
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.groupToDelete) {
      this.groupService
        .deleteGroup(
          this.selectedOrg,
          this.groupToDelete,
          reason,
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedGroups = this.selectedGroups.filter(
              g => g.id !== this.groupToDelete,
            );
            this.refreshList();
          }
        });
    }
    this.closeDeletePopup();
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadGroups(this.lastTableLazyLoadEvent);
    } else {
      this.loadGroups();
    }
  }
}
