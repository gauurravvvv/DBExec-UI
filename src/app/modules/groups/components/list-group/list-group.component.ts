import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
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
import { GROUP } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { RoleService } from 'src/app/modules/role/services/role.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { GroupService } from '../../services/group.service';

type GroupSortField = 'name' | 'status' | 'createdOn';

@Component({
  selector: 'app-list-group',
  templateUrl: './list-group.component.html',
  styleUrls: ['./list-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListGroupComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.groupService.cancelReads();
  }

  @ViewChild('dt') dt!: Table;

  private destroyRef = inject(DestroyRef);

  limit = 10;
  lastTableLazyLoadEvent: any;

  // Signal refs from service
  groups = this.groupService.groups;
  total = this.groupService.total;
  loading = this.groupService.loading;

  // Per-row spinner helpers — template asks for the id and the service
  // tells us whether THAT row's delete is in flight.
  isDeleting = (id: string): boolean => this.groupService.isDeleting(id);
  get isBulkDeleting(): boolean {
    return this.selectedGroups.some(g => this.groupService.isDeleting(g.id));
  }

  selectedGroups: any[] = [];

  sortHelper = new ListSortHelper<GroupSortField>();

  showDeleteConfirm = false;
  groupToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  roles: any[] = [];
  selectedRole: string | null = null;

  // Server-mode preload for the Role filter dropdown.
  preloadedRoles: any[] | null = null;
  preloadedRolesTotal: number | null = null;
  today = new Date();

  statusOptions: { label: string; value: number }[] = [];

  filterValues: any = {
    name: '',
    description: '',
    status: null,
    createdDateRange: null,
  };

  private filter$ = new Subject<void>();

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
    private roleService: RoleService,
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

    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadGroups();
      });

    this.loadRoles();
    // First fetch is driven by the <p-table [lazy]> component which
    // fires (onLazyLoad) on initial render with the correct paging
    // args. Calling loadGroups() here too would duplicate the request.
  }

  /**
   * Fetcher for the server-mode Role filter dropdown.
   */
  loadRolesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = { name: search };
    try {
      const res: any = await this.roleService.listRoles(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.roles ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Preload page 1 of roles so the dropdown can render without a fresh fetch
   * on first open.
   */
  loadRoles() {
    this.roleService
      .listRoles({ page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const roles = response?.data?.roles ?? [];
          this.roles = roles;
          this.preloadedRoles = roles;
          this.preloadedRolesTotal = response?.data?.count ?? roles.length;
        }
        this.cdr.markForCheck();
      });
  }

  get selectedCount(): number {
    return this.selectedGroups?.length || 0;
  }

  isRowSelectable = (event: any) => event?.data?.isDefault !== 1;

  onRoleChange(roleId: string | null) {
    this.selectedRole = roleId;
    this.loadGroups();
  }

  onFilterChange() {
    this.selectedGroups = [];
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
    this.loadGroups();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  toggleSort(field: GroupSortField) {
    this.sortHelper.toggle(field);
    this.selectedGroups = [];
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
    }
    this.loadGroups(this.lastTableLazyLoadEvent);
  }

  async loadGroups(event?: any) {
    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (prev && (prev.first !== event.first || prev.rows !== event.rows)) {
        this.selectedGroups = [];
      }
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      page: page,
      limit: limit,
    };

    if (this.selectedRole) {
      params.roleId = this.selectedRole;
    }

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

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    const sortParam = this.sortHelper.serialize();
    if (sortParam) params.sort = sortParam;

    await this.groupService.load(params);
    this.cdr.markForCheck();
  }

  onAddNewCategory() {
    this.router.navigate([GROUP.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([GROUP.edit(id)]);
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
        .bulkDelete(ids, reason)
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
        .delete(this.groupToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedGroups = this.selectedGroups.filter(
              g => g.id !== this.groupToDelete,
            );
            this.refreshList();
            this.closeDeletePopup();
          }
        })
        .catch(() => {});
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadGroups(this.lastTableLazyLoadEvent);
    } else {
      this.loadGroups();
    }
  }
}
