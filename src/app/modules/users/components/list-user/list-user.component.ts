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
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/constants';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { TranslateService } from '@ngx-translate/core';
import { UserService } from '../../services/user.service';

type UserSortField =
  | 'username'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'lastLogin'
  | 'status'
  | 'createdOn';

@Component({
  selector: 'app-list-user',
  templateUrl: './list-user.component.html',
  styleUrls: ['./list-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListUserComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  // Signal refs from service
  users = this.userService.users;
  total = this.userService.total;
  loading = this.userService.loading;

  limit = 10;
  lastTableLazyLoadEvent: any;

  selectedUsers: any[] = [];
  sortHelper = new ListSortHelper<UserSortField>();

  showDeleteConfirm = false;
  userToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';

  organisations: any[] = [];
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;
  groups: any[] = [];
  // Mirror of preloadedOrgs but for the server-mode Group filter. Cleared and
  // refilled whenever selectedOrg changes (groups are org-scoped).
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;
  selectedOrg: any = null;
  selectedGroup: string | null = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');
  today = new Date();

  statusOptions: any[] = [];

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
  private destroyRef = inject(DestroyRef);

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
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    // Setup debounced filter
    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
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

  /**
   * Fetcher for the server-mode org dropdown. Called by the dropdown on open,
   * on filter keystroke (debounced), and on near-end scroll.
   */
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

  /**
   * Initial bootstrap — fetch the first page of orgs, auto-select the first
   * and pass the same page to the dropdown as a preload so it doesn't refetch
   * on first open.
   */
  loadOrganisations() {
    this.organisationService
      .listOrganisation({ page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const orgs = response?.data?.orgs ?? [];
          this.preloadedOrgs = orgs;
          this.preloadedOrgsTotal = response?.data?.count ?? orgs.length;
          if (orgs.length > 0) {
            this.selectedOrg = orgs[0].id;
            this.loadGroupOptions();
            this.loadUsers();
          } else {
            this.selectedOrg = null;
          }
        }
        this.cdr.markForCheck();
      });
  }

  /**
   * Fetcher for the server-mode Group filter dropdown. Gates on selectedOrg
   * because groups are org-scoped; an open with no org would otherwise pull
   * groups across the entire fleet.
   */
  loadGroupsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const orgId =
      this.selectedOrg || this.globalService.getTokenDetails('organisationId');
    if (!orgId) return { items: [], total: 0 };
    const params: any = { orgId, page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.groupService.listGroups(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.groups ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Initial load: page 1 of groups so the dropdown's preload is ready and the
   * legacy `groups[]` array stays populated for other code paths.
   */
  loadGroupOptions() {
    const orgId =
      this.selectedOrg || this.globalService.getTokenDetails('organisationId');
    if (!orgId) return;
    this.groupService
      .listGroups({ orgId, page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const groups = response?.data?.groups ?? [];
          this.groups = groups.filter((g: any) => g.status === 1);
          this.preloadedGroups = groups;
          this.preloadedGroupsTotal = response?.data?.count ?? groups.length;
        }
        this.cdr.markForCheck();
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
    // Drop the group dropdown's seed so the next open re-fetches against the
    // newly selected org instead of showing stale options.
    this.preloadedGroups = null;
    this.preloadedGroupsTotal = null;
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

  toggleSort(field: UserSortField) {
    this.sortHelper.toggle(field);
    this.selectedUsers = [];
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
    }
    this.loadUsers(this.lastTableLazyLoadEvent);
  }

  loadUsers(event?: any) {
    if (!this.selectedOrg) return;

    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (prev && (prev.first !== event.first || prev.rows !== event.rows)) {
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

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    const sortParam = this.sortHelper.serialize();
    if (sortParam) params.sort = sortParam;

    this.userService
      .load(params)
      .then(() => {
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onAddNewAdmin() {
    this.router.navigate([USER.ADD]);
  }

  onOpenBulkAdd() {
    this.router.navigate([USER.BULK_ADD]);
  }

  onUnlock(id: string) {
    this.userService.unlock(this.selectedOrg, id).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        if (this.lastTableLazyLoadEvent) {
          this.loadUsers(this.lastTableLazyLoadEvent);
        }
      }
    });
  }

  onEdit(id: string) {
    this.router.navigate([USER.edit(this.selectedOrg, id)]);
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
        .bulkDelete(ids, reason, this.selectedOrg)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedUsers = [];
            this.refreshList();
          }
        })
        .finally(() => {
          this.closeDeletePopup();
          this.cdr.markForCheck();
        });
      return;
    }

    if (this.userToDelete) {
      this.userService
        .delete(this.userToDelete, this.selectedOrg, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedUsers = this.selectedUsers.filter(
              u => u.id !== this.userToDelete,
            );
            this.refreshList();
          }
          this.cdr.markForCheck();
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

  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadUsers(this.lastTableLazyLoadEvent);
    } else {
      this.loadUsers();
    }
  }
}
