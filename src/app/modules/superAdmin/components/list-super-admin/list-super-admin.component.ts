import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SuperAdminService } from '../../services/superAdmin.service';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { GlobalService } from 'src/app/core/services/global.service';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-list-super-admin',
  templateUrl: './list-super-admin.component.html',
  styleUrls: ['./list-super-admin.component.scss'],
})
export class ListSuperAdminComponent implements OnInit {
  Math = Math;
  loggedInUserId: any;

  @ViewChild('dt') dt!: Table;
  private searchSubject = new Subject<void>();

  superAdmins: any[] = [];
  totalItems = 0;

  showDeleteConfirm = false;
  adminIdToDelete: string | null = null;
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

  loading = false; // REMOVED (Global loader used)
  lastTableLazyLoadEvent: any;

  ngOnInit(): void {
    this.loggedInUserId = this.globalService.getTokenDetails('userId');
    // Initial load will be triggered by p-table lazy load if [lazy]="true" is set

    // Setup debounce for filter changes
    this.searchSubject.pipe(debounceTime(500)).subscribe(() => {
      // Trigger lazy load with current pagination but updated filters
      if (this.lastTableLazyLoadEvent) {
        this.loadSuperAdmins(this.lastTableLazyLoadEvent);
      }
    });
  }

  onFilterChange() {
    this.searchSubject.next();
  }

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
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminIdToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.adminIdToDelete && this.deleteJustification.trim()) {
      this.onDelete(this.adminIdToDelete);
      this.showDeleteConfirm = false;
      this.adminIdToDelete = null;
      this.deleteJustification = '';
    }
  }

  onDelete(adminId: string) {
    this.superAdminService
      .deleteSuperAdmin(adminId, this.deleteJustification.trim())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          // Refresh current view
          if (this.lastTableLazyLoadEvent) {
            this.loadSuperAdmins(this.lastTableLazyLoadEvent);
          }
        }
      });
  }

  onUnlock(adminId: string) {
    this.superAdminService.unlockSuperAdmin(adminId).then((res: any) => {
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
    // this.loading = true; // REMOVED
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

    this.superAdminService
      .listSuperAdmin(params)
      .then((res: any) => {
        // this.loading = false; // REMOVED
        if (this.globalService.handleSuccessService(res, false)) {
          this.superAdmins = res.data.superAdmins;
          this.totalItems = res.data.count;
        }
      })
      .catch(() => {
        // this.loading = false; // REMOVED
      });
  }
}
