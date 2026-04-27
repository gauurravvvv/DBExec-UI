import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  ) {}

  ngOnInit() {
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
          this.loadGroups();
        } else {
          this.selectedOrg = null;
        }
      }
      this.cdr.markForCheck();
    });
  }

  loadRoles() {
    if (!this.selectedOrg) return;
    this.roleService.listRoles(this.selectedOrg).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.roles = response.data.roles || [];
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

  async loadGroups(event?: any) {
    if (!this.selectedOrg) return;

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
