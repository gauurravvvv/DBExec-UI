import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SuperAdminService } from '../../services/superAdmin.service';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { GlobalService } from 'src/app/core/services/global.service';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-list-super-admin',
  templateUrl: './list-super-admin.component.html',
  styleUrls: ['./list-super-admin.component.scss'],
})
export class ListSuperAdminComponent implements OnInit {
  Math = Math;
  loggedInUserId: any;

  listParams: IParams = {
    limit: 100,
    pageNumber: 1,
  };

  superAdmins: any[] = [];

  // Pagination
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;

  // Search
  searchTerm = '';
  filteredAdmins: any[] = [];

  showDeleteConfirm = false;
  adminIdToDelete: number | null = null;

  selectedStatus: number | null = null;

  statusFilterItems: MenuItem[] = [
    {
      label: 'All',
      icon: 'pi pi-filter-slash',
      command: () => this.filterByStatus(null),
    },
    {
      label: 'Active',
      icon: 'pi pi-check-circle',
      command: () => this.filterByStatus(1),
    },
    {
      label: 'Inactive',
      icon: 'pi pi-ban',
      command: () => this.filterByStatus(0),
    },
  ];

  constructor(
    private superAdminService: SuperAdminService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.loggedInUserId = this.globalService.getTokenDetails('userId');
    this.listSuperAdminAPI();
    this.applyAllFilters();
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.currentPage = 1;
    this.applyAllFilters();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.applyAllFilters();
  }

  onPageSizeChange(event: Event): void {
    this.pageSize = Number((event.target as HTMLSelectElement).value);
    this.currentPage = 1; // Reset to first page when changing page size
    this.applyAllFilters();
  }

  private applyAllFilters() {
    let filtered = [...this.superAdmins];

    // Apply status filter
    if (this.selectedStatus !== null) {
      filtered = filtered.filter(admin => admin.status === this.selectedStatus);
    }

    // Apply search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        admin =>
          admin.firstName.toLowerCase().includes(term) ||
          admin.lastName.toLowerCase().includes(term)
      );
    }

    // Update total count and apply pagination
    this.totalItems = filtered.length;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.filteredAdmins = filtered.slice(
      startIndex,
      startIndex + this.pageSize
    );
  }

  filterByStatus(status: number | null) {
    this.selectedStatus = status;
    this.currentPage = 1; // Reset to first page when filtering

    if (status === null) {
      // Clear search text when "All" is selected
      this.searchTerm = '';
      // Reset to show all admins
      this.filteredAdmins = [...this.superAdmins];
      this.totalItems = this.superAdmins.length;
    } else {
      this.applyAllFilters();
    }
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
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
    this.superAdminService.deleteSuperAdmin(adminId).subscribe((res: any) => {
      if (res.status) {
        this.listSuperAdminAPI();
      }
    });
  }

  onAddNewAdmin(): void {
    this.router.navigate([SUPER_ADMIN.ADD]);
  }

  listSuperAdminAPI() {
    this.superAdminService
      .listSuperAdmin(this.listParams)
      .subscribe((res: any) => {
        this.superAdmins = [...res.data.superAdmins];
        this.filteredAdmins = [...this.superAdmins];
        this.totalItems = this.superAdmins.length;
      });
  }
}
