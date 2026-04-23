import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ROLE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { RoleService } from '../../services/role.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-role',
  templateUrl: './list-role.component.html',
  styleUrls: ['./list-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListRoleComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  roles: any[] = [];
  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  selectedRoles: any[] = [];

  showDeleteConfirm = false;
  roleToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';

  organisations: any[] = [];
  selectedOrgId: any = null;
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
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
    private roleService: RoleService,
  ) {}

  ngOnInit() {
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => {
        this.loadRoles();
      });

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrgId = this.globalService.getTokenDetails('organisationId');
      this.loadRoles();
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
          this.selectedOrgId = this.organisations[0].id;
          this.loadRoles();
        } else {
          this.selectedOrgId = null;
          this.roles = [];
          this.totalRecords = 0;
        }
      }
    });
  }

  get selectedCount(): number {
    return this.selectedRoles?.length || 0;
  }

  isRowSelectable = (event: any) => event?.data?.isDefault !== 1;

  onOrgChange(orgId: any) {
    this.selectedOrgId = orgId;
    this.selectedRoles = [];
    this.lastTableLazyLoadEvent = null;
    this.loadRoles();
  }

  onFilterChange() {
    this.selectedRoles = [];
    this.filter$.next();
  }

  clearFilters() {
    this.filterValues = {
      name: '',
      description: '',
      status: null,
      createdDateRange: null,
    };
    this.lastTableLazyLoadEvent = null;
    this.loadRoles();
  }

  onCreatedDateRangeChange(range: Date[] | null) {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) {
      this.onFilterChange();
    }
  }

  loadRoles(event?: any) {
    if (!this.selectedOrgId) return;

    if (event) {
      const prev = this.lastTableLazyLoadEvent;
      if (
        prev &&
        (prev.first !== event.first ||
          prev.rows !== event.rows ||
          prev.sortField !== event.sortField ||
          prev.sortOrder !== event.sortOrder)
      ) {
        this.selectedRoles = [];
      }
      this.lastTableLazyLoadEvent = event;
    }

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const filter: any = {};
    if (this.filterValues.name) filter.name = this.filterValues.name;
    if (this.filterValues.description) filter.description = this.filterValues.description;
    if (this.filterValues.status !== null && this.filterValues.status !== undefined) {
      filter.status = this.filterValues.status;
    }
    if (this.filterValues.createdDateRange?.[0]) {
      filter.createdDateFrom = this.filterValues.createdDateRange[0].toISOString();
    }
    if (this.filterValues.createdDateRange?.[1]) {
      const to = new Date(this.filterValues.createdDateRange[1]);
      to.setHours(23, 59, 59, 999);
      filter.createdDateTo = to.toISOString();
    }

    this.roleService
      .listRoles(this.selectedOrgId, {
        page,
        limit,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.roles = response.data.roles || [];
          this.totalRecords = response.data.count || 0;
        } else {
          this.roles = [];
          this.totalRecords = 0;
        }
      });
  }

  onAddNewRole() {
    this.router.navigate([ROLE.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([ROLE.EDIT, this.selectedOrgId, id]);
  }

  confirmDelete(id: string) {
    this.roleToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.roleToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.roleToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedRoles.map(r => r.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.roleService
        .bulkDeleteRole(ids, reason, this.selectedOrgId)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedRoles = [];
            this.refreshList();
          }
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.roleToDelete) {
      this.roleService
        .deleteRole(
          this.selectedOrgId,
          this.roleToDelete,
          reason,
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedRoles = this.selectedRoles.filter(
              r => r.id !== this.roleToDelete,
            );
            this.refreshList();
          }
        });
    }
    this.closeDeletePopup();
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.roleToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadRoles(this.lastTableLazyLoadEvent);
    } else {
      this.loadRoles();
    }
  }
}
