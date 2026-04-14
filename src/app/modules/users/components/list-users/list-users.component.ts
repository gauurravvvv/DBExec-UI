import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from '../../services/user.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-users',
  templateUrl: './list-users.component.html',
  styleUrls: ['./list-users.component.scss'],
})
export class ListUsersComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  users: any[] = [];
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  filteredUsers: any[] = [];

  selectedUsers: any[] = [];

  showDeleteConfirm = false;
  userToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';

  organisations: any[] = [];
  groups: any[] = [];
  selectedOrg: any = null;
  selectedGroup: string | null = null;
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
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    status: null,
    lastLoginDateRange: null,
    createdDateRange: null,
  };

  // Debouncing for filter changes
  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.username ||
      !!this.filterValues.firstName ||
      !!this.filterValues.lastName ||
      !!this.filterValues.email ||
      this.filterValues.status !== null ||
      !!this.filterValues.lastLoginDateRange ||
      !!this.filterValues.createdDateRange ||
      !!this.selectedGroup
    );
  }

  constructor(
    private userService: UserService,
    private organisationService: OrganisationService,
    private groupService: GroupService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    // Setup debounced filter
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadUsers();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadGroupOptions();
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
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadGroupOptions();
          // Trigger load after org is selected
          this.loadUsers();
        } else {
          this.selectedOrg = null;
          this.users = [];
          this.filteredUsers = [];
          this.totalRecords = 0;
        }
      }
    });
  }

  loadGroupOptions() {
    const orgId = this.selectedOrg || this.globalService.getTokenDetails('organisationId');
    if (!orgId) return;
    this.groupService
      .listGroups({ orgId, page: DEFAULT_PAGE, limit: MAX_LIMIT })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.groups = (response.data.groups || []).filter(
            (g: any) => g.status === 1,
          );
        }
      });
  }

  get selectedCount(): number {
    return this.selectedUsers?.length || 0;
  }

  isRowSelectable = (event: any) => !!event?.data?.canDelete;

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.selectedGroup = null;
    this.selectedUsers = [];
    this.groups = [];
    this.loadGroupOptions();
    this.loadUsers();
  }

  onGroupChange(groupId: string | null) {
    this.selectedGroup = groupId;
    this.loadUsers();
  }

  onFilterChange() {
    this.selectedUsers = [];
    // Trigger debounced API call
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      username: '',
      firstName: '',
      lastName: '',
      email: '',
      status: null,
      lastLoginDateRange: null,
      createdDateRange: null,
    };
    this.selectedGroup = null;
    // Immediately reload without filters
    this.loadUsers();
  }

  onLastLoginDateRangeChange(range: Date[] | null) {
    this.filterValues.lastLoginDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadUsers(event?: any) {
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
        this.selectedUsers = [];
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

    if (this.selectedGroup) {
      params.groupId = this.selectedGroup;
    }

    // Build filter object
    const filter: any = {};
    if (this.filterValues.username) {
      filter.username = this.filterValues.username;
    }
    if (this.filterValues.firstName) {
      filter.firstName = this.filterValues.firstName;
    }
    if (this.filterValues.lastName) {
      filter.lastName = this.filterValues.lastName;
    }
    if (this.filterValues.email) {
      filter.email = this.filterValues.email;
    }
    if (
      this.filterValues.status !== null &&
      this.filterValues.status !== undefined
    ) {
      filter.status = this.filterValues.status;
    }
    if (this.filterValues.lastLoginDateRange?.[0]) {
      filter.lastLoginDateFrom =
        this.filterValues.lastLoginDateRange[0].toISOString();
    }
    if (this.filterValues.lastLoginDateRange?.[1]) {
      const dateTo = new Date(this.filterValues.lastLoginDateRange[1]);
      dateTo.setHours(23, 59, 59, 999);
      filter.lastLoginDateTo = dateTo.toISOString();
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

    this.userService
      .listUser(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.users = response.data.users || [];
          this.filteredUsers = [...this.users];
          this.totalRecords = response.data.totalItems || this.users.length;
        } else {
          this.users = [];
          this.filteredUsers = [];
          this.totalRecords = 0;
        }
      })
      .catch(() => {
        this.users = [];
        this.filteredUsers = [];
        this.totalRecords = 0;
      });
  }

  onAddNewAdmin() {
    this.router.navigate([USER.ADD]);
  }

  onUnlock(id: string) {
    this.userService.unlockUser(this.selectedOrg, id).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        if (this.lastTableLazyLoadEvent) {
          this.loadUsers(this.lastTableLazyLoadEvent);
        }
      }
    });
  }

  onEdit(id: string) {
    this.router.navigate([USER.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.userToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.userToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.userToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedUsers.map(u => u.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.userService
        .bulkDeleteUser(ids, reason, this.selectedOrg)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedUsers = [];
            this.refreshList();
          }
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.userToDelete) {
      this.userService
        .deleteUser(
          this.userToDelete,
          this.selectedOrg,
          reason,
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedUsers = this.selectedUsers.filter(
              u => u.id !== this.userToDelete,
            );
            this.refreshList();
          }
        });
    }
    this.closeDeletePopup();
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.userToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadUsers(this.lastTableLazyLoadEvent);
    } else {
      this.loadUsers();
    }
  }
}
