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
  adminIdToDelete: number | null = null;

  // Component-managed filter values
  filterValues: any = {
    username: '',
    firstName: '',
    lastName: '',
    email: '',
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
      !!this.filterValues.email
    );
  }

  clearFilters() {
    this.filterValues = {
      username: '',
      firstName: '',
      lastName: '',
      email: '',
    };
    this.onFilterChange();
  }

  onEdit(adminId: string): void {
    this.router.navigate([SUPER_ADMIN.EDIT + '/' + adminId]);
  }

  confirmDelete(adminId: number) {
    this.adminIdToDelete = adminId;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminIdToDelete = null;
  }

  proceedDelete() {
    if (this.adminIdToDelete) {
      this.onDelete(this.adminIdToDelete);
      this.showDeleteConfirm = false;
      this.adminIdToDelete = null;
    }
  }

  onDelete(adminId: number) {
    this.superAdminService.deleteSuperAdmin(adminId).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        // Refresh current view
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
