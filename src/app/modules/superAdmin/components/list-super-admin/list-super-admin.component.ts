import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SuperAdminService } from '../../services/superAdmin.service';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { GlobalService } from 'src/app/core/services/global.service';

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

  constructor(
    private superAdminService: SuperAdminService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.loggedInUserId = this.globalService.getTokenDetails('userId');
    this.listSuperAdminAPI();
    this.applyFilters();
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.currentPage = 1; // Reset to first page when searching
    this.applyFilters();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.applyFilters();
  }

  onPageSizeChange(event: Event): void {
    this.pageSize = Number((event.target as HTMLSelectElement).value);
    this.currentPage = 1; // Reset to first page when changing page size
    this.applyFilters();
  }

  private applyFilters(): void {
    // First apply search filter
    let filtered = this.superAdmins;
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = this.superAdmins.filter(
        admin =>
          (admin.firstName + ' ' + admin.lastName)
            .toLowerCase()
            .includes(term) || admin.email.toLowerCase().includes(term)
      );
    }

    // Update total count
    this.totalItems = filtered.length;

    // Then apply pagination
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.filteredAdmins = filtered.slice(
      startIndex,
      startIndex + this.pageSize
    );
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
