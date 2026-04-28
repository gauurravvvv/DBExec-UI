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
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { ROLE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TranslateService } from '@ngx-translate/core';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-list-role',
  templateUrl: './list-role.component.html',
  styleUrls: ['./list-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListRoleComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  // Signal refs from service
  roles = this.roleService.roles;
  total = this.roleService.total;
  loading = this.roleService.loading;

  limit = 10;
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

  statusOptions: { label: string; value: number }[] = [];

  filterValues: any = {
    name: '',
    description: '',
    status: null,
    createdDateRange: null,
  };

  private filter$ = new Subject<void>();
  private destroyRef = inject(DestroyRef);

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
      .subscribe(() => this.loadRoles());

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrgId = this.globalService.getTokenDetails('organisationId');
      this.loadRoles();
    }
  }

  loadOrganisations() {
    const params = { page: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrgId = this.organisations[0].id;
          this.loadRoles();
        } else {
          this.selectedOrgId = null;
        }
      }
      this.cdr.markForCheck();
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
    if (this.filterValues.description)
      filter.description = this.filterValues.description;
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
      const to = new Date(this.filterValues.createdDateRange[1]);
      to.setHours(23, 59, 59, 999);
      filter.createdDateTo = to.toISOString();
    }

    const params: any = { orgId: this.selectedOrgId, page, limit };
    if (Object.keys(filter).length > 0) params.filter = JSON.stringify(filter);
    this.roleService.load(params);
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
        .bulkDelete(ids, reason, this.selectedOrgId)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedRoles = [];
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.roleToDelete) {
      this.roleService
        .delete(this.selectedOrgId, this.roleToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedRoles = this.selectedRoles.filter(
              r => r.id !== this.roleToDelete,
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
