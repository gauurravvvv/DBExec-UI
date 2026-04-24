import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SuperAdminService } from '../../services/superAdmin.service';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { GlobalService } from 'src/app/core/services/global.service';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-list-super-admin',
  templateUrl: './list-super-admin.component.html',
  styleUrls: ['./list-super-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSuperAdminComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  Math = Math;
  loggedInUserId: any;

  @ViewChild('dt') dt!: Table;
  private searchSubject = new Subject<void>();

  admins  = this.superAdminService.admins;
  total   = this.superAdminService.total;
  loading = this.superAdminService.loading;

  selectedAdmins: any[] = [];

  showDeleteConfirm = false;
  adminIdToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';

  today = new Date();

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

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
    private superAdminService: SuperAdminService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  lastTableLazyLoadEvent: any;

  ngOnInit(): void {
    this.loggedInUserId = this.globalService.getTokenDetails('userId');
    // Initial load will be triggered by p-table lazy load if [lazy]="true" is set

    // Setup debounce for filter changes
    this.searchSubject.pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
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
    this.router.navigate([SUPER_ADMIN.EDIT + '/' + adminId]);
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
      this.superAdminService
        .bulkDelete(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedAdmins = [];
            this.refreshList();
          }
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

  private refreshList() {
    if (this.lastTableLazyLoadEvent) {
      this.loadSuperAdmins(this.lastTableLazyLoadEvent);
    }
  }

  onDelete(adminId: string) {
    this.superAdminService
      .delete(adminId, this.deleteJustification.trim())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.selectedAdmins = this.selectedAdmins.filter(
            a => a.id !== adminId,
          );
          this.refreshList();
        }
      });
  }

  onUnlock(adminId: string) {
    this.superAdminService.unlock(adminId).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        if (this.lastTableLazyLoadEvent) {
          this.loadSuperAdmins(this.lastTableLazyLoadEvent);
        }
      }
    });
  }

  onAddNewAdmin(): void {
    this.router.navigate([SUPER_ADMIN.ADD]);
  }

  loadSuperAdmins(event: any) {
    // Clear selection when page/sort changes (not on same-page re-fetch after delete)
    const prev = this.lastTableLazyLoadEvent;
    if (
      prev &&
      (prev.first !== event.first ||
        prev.rows !== event.rows ||
        prev.sortField !== event.sortField ||
        prev.sortOrder !== event.sortOrder)
    ) {
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

    this.superAdminService.load(params);
  }
}
