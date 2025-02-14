import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ORGANISATION } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { OrganisationService } from '../../services/organisation.service';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-list-organisation',
  templateUrl: './list-organisation.component.html',
  styleUrls: ['./list-organisation.component.scss'],
})
export class ListOrganisationComponent implements OnInit {
  Math = Math;

  listParams: IParams = {
    limit: 100,
    pageNumber: 1,
  };

  organisations: any[] = [];

  // Pagination
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;

  // Search
  searchTerm = '';
  filteredOrgs: any[] = [];

  // Delete confirmation
  showDeleteConfirm = false;
  orgIdToDelete: number | null = null;

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

  selectedStatus: number | null = null;

  constructor(
    private organisationService: OrganisationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.listOrganisationAPI();
    this.applyFilters();
  }

  private applyAllFilters() {
    let filtered = [...this.organisations];

    // Apply status filter
    if (this.selectedStatus !== null) {
      filtered = filtered.filter(org => org.status === this.selectedStatus);
    }

    // Apply search filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(org => org.name.toLowerCase().includes(term));
    }

    // Update total count and apply pagination
    this.totalItems = filtered.length;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.filteredOrgs = filtered.slice(startIndex, startIndex + this.pageSize);
  }

  onSearch(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.currentPage = 1; // Reset to first page when searching
    this.applyAllFilters();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.applyAllFilters();
  }

  onPageSizeChange(event: Event): void {
    this.pageSize = Number((event.target as HTMLSelectElement).value);
    this.currentPage = 1;
    this.applyFilters();
  }

  private applyFilters(): void {
    // First apply search filter
    let filtered = this.organisations;
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = this.organisations.filter(organisation =>
        organisation.name.toLowerCase().includes(term)
      );
    }

    // Update total count
    this.totalItems = filtered.length;

    // Then apply pagination
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.filteredOrgs = filtered.slice(startIndex, startIndex + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  listOrganisationAPI() {
    this.organisationService
      .listOrganisation(this.listParams)
      .subscribe((res: any) => {
        this.organisations = [...res.data.orgs];
        this.filteredOrgs = [...this.organisations];
        this.totalItems = this.organisations.length;
      });
  }

  confirmDelete(orgId: number) {
    this.orgIdToDelete = orgId;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.orgIdToDelete = null;
  }

  proceedDelete() {
    if (this.orgIdToDelete) {
      this.onDelete(this.orgIdToDelete);
      this.showDeleteConfirm = false;
      this.orgIdToDelete = null;
    }
  }

  onDelete(orgId: number) {
    this.organisationService
      .deleteOrganisation(orgId.toString())
      .subscribe((res: any) => {
        if (res.status) {
          this.listOrganisationAPI();
        }
      });
  }

  onEdit(org: any) {
    this.router.navigate([ORGANISATION.EDIT + '/' + org.id]);
  }

  onAddNewOrganisation() {
    this.router.navigate([ORGANISATION.ADD]);
  }

  filterByStatus(status: number | null) {
    this.selectedStatus = status;
    this.currentPage = 1; // Reset to first page when filtering

    if (status === null) {
      // Clear search text when "All" is selected
      this.searchTerm = '';
      // Reset to show all organisations
      this.filteredOrgs = [...this.organisations];
      this.totalItems = this.organisations.length;
    } else {
      this.applyAllFilters();
    }
  }
}
