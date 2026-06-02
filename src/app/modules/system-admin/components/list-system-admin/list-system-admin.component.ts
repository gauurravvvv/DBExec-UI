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
import { SYSTEM_ADMIN } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ListSortHelper } from 'src/app/shared/helpers/list-sort.helper';
import { SystemAdminService } from '../../services/system-admin.service';

type SystemAdminSortField =
  | 'username'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'lastLogin'
  | 'status'
  | 'createdOn';

@Component({
  selector: 'app-list-system-admin',
  templateUrl: './list-system-admin.component.html',
  styleUrls: ['./list-system-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSystemAdminComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.systemAdminService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);

  Math = Math;
  loggedInUserId: any;

  @ViewChild('dt') dt!: Table;
  private searchSubject = new Subject<void>();

  admins = this.systemAdminService.admins;
  total = this.systemAdminService.total;
  loading = this.systemAdminService.loading;

  // Per-row spinner helpers — template asks for the id and the service
  // tells us whether THAT row's delete / unlock is in flight. Other
  // rows stay clickable.
  isDeleting = (id: string): boolean => this.systemAdminService.isDeleting(id);
  isUnlocking = (id: string): boolean =>
    this.systemAdminService.isUnlocking(id);
  get isBulkDeleting(): boolean {
    return this.selectedAdmins.some(a =>
      this.systemAdminService.isDeleting(a.id),
    );
  }

  selectedAdmins: any[] = [];
  sortHelper = new ListSortHelper<SystemAdminSortField>();

  showDeleteConfirm = false;
  adminIdToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';

  today = new Date();

  statusOptions: { label: string; value: number }[] = [];

  // Component-managed filter values
  filterValues: any = {
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    status: null,
    lastLoginDateRange: null,
    createdDateRange: null,
  };

  constructor(
    private systemAdminService: SystemAdminService,
    private router: Router,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  lastTableLazyLoadEvent: any;

  ngOnInit(): void {
    this.loggedInUserId = this.globalService.getTokenDetails('userId');
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];
    // Initial load will be triggered by p-table lazy load if [lazy]="true" is set

    // Setup debounce for filter changes
    this.searchSubject
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Trigger lazy load with current pagination but updated filters
        if (this.lastTableLazyLoadEvent) {
          this.loadSuperAdmins(this.lastTableLazyLoadEvent);
        }
      });
  }

  onFilterChange() {
    this.selectedAdmins = [];
    this.searchSubject.next();
  }

  get selectedCount(): number {
    return this.selectedAdmins?.length || 0;
  }

  get deletableAdmins(): any[] {
    return this.admins().filter(a => a.canDelete);
  }

  isRowSelectable = (event: any) => !!event?.data?.canDelete;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.username ||
      !!this.filterValues.firstName ||
      !!this.filterValues.lastName ||
      !!this.filterValues.email ||
      this.filterValues.status !== null ||
      !!this.filterValues.lastLoginDateRange ||
      !!this.filterValues.createdDateRange
    );
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
    this.onFilterChange();
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

  onEdit(adminId: string): void {
    this.router.navigate([SYSTEM_ADMIN.edit(adminId)]);
  }

  confirmDelete(adminId: string) {
    this.adminIdToDelete = adminId;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.adminIdToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminIdToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedAdmins.map(a => a.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.systemAdminService
        .bulkDelete(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedAdmins = [];
            this.refreshList();
          }
          this.cdr.markForCheck();
        })
        .finally(() => this.closeDeletePopup());
      return;
    }

    if (this.adminIdToDelete) {
      this.onDelete(this.adminIdToDelete);
    }
    this.closeDeletePopup();
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.adminIdToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadSuperAdmins(this.lastTableLazyLoadEvent);
    }
  }

  onDelete(adminId: string) {
    this.systemAdminService
      .delete(adminId, this.deleteJustification.trim())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.selectedAdmins = this.selectedAdmins.filter(
            a => a.id !== adminId,
          );
          this.refreshList();
        }
        this.cdr.markForCheck();
      });
  }

  onUnlock(adminId: string) {
    this.systemAdminService.unlock(adminId).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        if (this.lastTableLazyLoadEvent) {
          this.loadSuperAdmins(this.lastTableLazyLoadEvent);
        }
      }
      this.cdr.markForCheck();
    });
  }

  onAddNewAdmin(): void {
    this.router.navigate([SYSTEM_ADMIN.ADD]);
  }

  toggleSort(field: SystemAdminSortField) {
    this.sortHelper.toggle(field);
    this.selectedAdmins = [];
    if (this.lastTableLazyLoadEvent) {
      this.lastTableLazyLoadEvent.first = 0;
      this.loadSuperAdmins(this.lastTableLazyLoadEvent);
    }
  }

  loadSuperAdmins(event: any) {
    const prev = this.lastTableLazyLoadEvent;
    if (prev && (prev.first !== event.first || prev.rows !== event.rows)) {
      this.selectedAdmins = [];
    }
    this.lastTableLazyLoadEvent = event;

    const page = event.first / event.rows + 1;
    const limit = event.rows;

    const params: any = {
      page,
      limit,
    };

    const filter: any = {};

    // Handle Filters from component-managed filterValues
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
    if (
      this.filterValues.status !== null &&
      this.filterValues.status !== undefined
    ) {
      filter.status = this.filterValues.status;
    }

    if (Object.keys(filter).length > 0) {
      params.filter = JSON.stringify(filter);
    }

    const sortParam = this.sortHelper.serialize();
    if (sortParam) params.sort = sortParam;

    this.systemAdminService.load(params);
  }
}
