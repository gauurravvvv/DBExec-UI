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
import { TranslateService } from '@ngx-translate/core';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { USER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
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

  groups: any[] = [];
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;
  selectedGroup: string | null = null;
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

    this.loadGroupOptions();
  }

  /**
   * Fetcher for the server-mode Group filter dropdown.
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
    const params: any = { page, limit };
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
    this.groupService
      .listGroups({ page: DEFAULT_PAGE, limit: 10 })
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
    this.userService.unlock(id).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        if (this.lastTableLazyLoadEvent) {
          this.loadUsers(this.lastTableLazyLoadEvent);
        }
      }
    });
  }

  onEdit(id: string) {
    this.router.navigate([USER.edit(id)]);
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
        .bulkDelete(ids, reason)
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
        .delete(this.userToDelete, reason)
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
