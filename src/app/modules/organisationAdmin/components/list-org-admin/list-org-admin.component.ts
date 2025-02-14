import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { OrganisationAdminService } from '../../services/organisationAdmin.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';

@Component({
  selector: 'app-list-org-admin',
  templateUrl: './list-org-admin.component.html',
  styleUrls: ['./list-org-admin.component.scss'],
})
export class ListOrgAdminComponent implements OnInit {
  admins: any[] = [];
  filteredAdmins: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  adminToDelete: string | null = null;
  loggedInUserId: string = '';
  Math = Math;
  organisations: any[] = [];
  selectedOrg: any = null;

  statusFilterItems: MenuItem[] = [
    {
      label: 'All',
      command: () => this.filterByStatus(null),
    },
    {
      label: 'Active',
      command: () => this.filterByStatus(1),
    },
    {
      label: 'Inactive',
      command: () => this.filterByStatus(0),
    },
  ];

  constructor(
    private orgAdminService: OrganisationAdminService,
    private organisationService: OrganisationService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadOrganisations();
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadAdmins();
        }
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  onOrgChange(event: any) {
    this.selectedOrg = event.value;
    this.currentPage = 1;
    this.loadAdmins();
  }

  loadAdmins() {
    if (!this.selectedOrg) return;

    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.orgAdminService.listOrganisationAdmin(params).subscribe({
      next: (response: any) => {
        this.admins = response.data;
        this.filteredAdmins = [...this.admins];
        this.totalItems = response.total;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
      },
      error: error => {
        console.error('Error loading organisation admins:', error);
      },
    });
  }

  generatePageNumbers() {
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.loadAdmins();
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value;
    this.applyFilters();
  }

  filterByStatus(status: number | null) {
    this.selectedStatus = status;
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.admins];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        admin =>
          admin.firstName.toLowerCase().includes(search) ||
          admin.lastName.toLowerCase().includes(search) ||
          admin.email.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(admin => admin.status === this.selectedStatus);
    }

    this.filteredAdmins = filtered;
  }

  onAddNewAdmin() {
    this.router.navigate(['/app/org-admin/add']);
  }

  onEdit(id: string) {
    this.router.navigate(['/app/org-admin/edit', id]);
  }

  confirmDelete(id: string) {
    this.adminToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminToDelete = null;
  }

  proceedDelete() {
    if (this.adminToDelete) {
      this.orgAdminService
        .deleteAdminOrganisation(this.adminToDelete)
        .subscribe({
          next: () => {
            this.loadAdmins();
            this.showDeleteConfirm = false;
            this.adminToDelete = null;
          },
          error: error => {
            console.error('Error deleting organisation admin:', error);
            this.showDeleteConfirm = false;
            this.adminToDelete = null;
          },
        });
    }
  }
}
