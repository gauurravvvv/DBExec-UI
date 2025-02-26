import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { CredentialService } from '../../services/credential.service';

@Component({
  selector: 'app-list-credentials',
  templateUrl: './list-credentials.component.html',
  styleUrls: ['./list-credentials.component.scss'],
})
export class ListCredentialsComponent implements OnInit {
  organisations: any[] = [];
  selectedOrg: any = null;
  selectedStatus: number | null = null;
  searchTerm: string = '';

  filteredCredentials: any[] = [];
  credentials: any[] = [];

  // Pagination
  currentPage: number = 1;
  pageSize: number = 10;
  totalItems: number = 0;
  totalPages: number = 0;
  pages: number[] = [];
  Math = Math;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;

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

  showDeleteConfirm: boolean = false;
  credentialToDelete: number | null = null;

  constructor(
    private router: Router,
    private globalService: GlobalService,
    private organisationService: OrganisationService,
    private credentialService: CredentialService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadCredentials();
    }
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadCredentials();
        }
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  loadCredentials() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };
    // Implement credentials loading logic
    this.credentialService.listCredentials(params).subscribe({
      next: (response: any) => {
        this.credentials = response.data.credentials;
      },
      error: error => {
        console.error('Error loading credentials:', error);
      },
    });
  }

  onOrgChange(event: any) {
    this.loadCredentials();
    this.applyFilters();
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
    // Implement filtering logic
  }

  onAddNewCredential() {
    // Implement navigation to add new credential
  }

  onEdit(id: number) {
    // Implement edit functionality
  }

  confirmDelete(id: number) {
    this.credentialToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.credentialToDelete = null;
  }

  proceedDelete() {
    // Implement delete functionality
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.applyFilters();
  }
}
