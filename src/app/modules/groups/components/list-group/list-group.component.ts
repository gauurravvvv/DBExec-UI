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
import { GROUP } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { RoleService } from 'src/app/modules/role/services/role.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { TranslateService } from '@ngx-translate/core';
import { GroupService } from '../../services/group.service';

type GroupSortField = 'name' | 'status' | 'createdOn';

@Component({
  selector: 'app-list-group',
  templateUrl: './list-group.component.html',
  styleUrls: ['./list-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListGroupComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  private destroyRef = inject(DestroyRef);

  limit = 10;
  lastTableLazyLoadEvent: any;

  // Signal refs from service
  groups = this.groupService.groups;
  total = this.groupService.total;
  loading = this.groupService.loading;

  selectedGroups: any[] = [];

  sortHelper = new ListSortHelper<GroupSortField>();

  showDeleteConfirm = false;
  groupToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  roles: any[] = [];
  selectedOrg: any = null;
  selectedRole: string | null = null;

  // Seeds the org dropdown's server-mode panel on first open and lets it
  // render the auto-selected org's label without a separate fetch.
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;

  // Same idea as preloadedOrgs but for the Role filter dropdown. Refilled
  // whenever the selected org changes (since roles are org-scoped).
  preloadedRoles: any[] | null = null;
  preloadedRolesTotal: number | null = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
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
    private organisationService: OrganisationService,
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

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadRoles();
      this.loadGroups();
    }
  }

  /**
   * Fetcher passed to app-custom-dropdown in server mode. The dropdown calls
   * this on open, on filter (debounced inside the dropdown), and on
   * near-end scroll. Returns one page; the dropdown handles append vs replace.
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
   * Initial bootstrap for system-admin view: fetch the first page of orgs so we
   * can (a) auto-select the first org and (b) seed the server-mode dropdown
   * with the same page — avoids a duplicate request when the user opens the
   * panel. Uses the dropdown's normal page size so the seed is reusable.
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
            this.loadRoles();
            this.loadGroups();
          } else {
            this.selectedOrg = null;
          }
        }
        this.cdr.markForCheck();
      });
  }

  /**
   * Fetcher for the server-mode Role filter dropdown. roleService.listRoles
   * takes (orgId, {page, limit, filter}) and maps filter.name through to the
   * BE — same shape as the Org dropdown above, just gated on a selected org.
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
    if (!this.selectedOrg) return { items: [], total: 0 };
    const params: any = { page, limit };
    if (search) params.filter = { name: search };
    try {
      const res: any = await this.roleService.listRoles(
        this.selectedOrg,
        params,
      );
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
   * on first open, and so the existing `roles[]` array remains populated for
   * any code that references it.
   */
  loadRoles() {
    if (!this.selectedOrg) return;
    this.roleService
      .listRoles(this.selectedOrg, { page: DEFAULT_PAGE, limit: 10 })
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

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.selectedRole = null;
    this.selectedGroups = [];
    this.roles = [];
    // Clear preload so the role dropdown re-fetches against the new org on
    // next panel open (in addition to the preload we kick off below).
    this.preloadedRoles = null;
    this.preloadedRolesTotal = null;
    this.loadRoles();
    this.loadGroups();
  }

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
    if (!this.selectedOrg) return;

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
      orgId: this.selectedOrg,
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
        .bulkDelete(ids, reason, this.selectedOrg)
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
        .delete(this.selectedOrg, this.groupToDelete, reason)
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

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadGroups(this.lastTableLazyLoadEvent);
    } else {
      this.loadGroups();
    }
  }
}
