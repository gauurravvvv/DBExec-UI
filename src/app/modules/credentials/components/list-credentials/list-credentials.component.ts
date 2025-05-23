import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { CredentialService } from '../../services/credential.service';
import { CREDENTIAL } from 'src/app/constants/routes';
import { saveAs } from 'file-saver';

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
  selectedCredCategoryId!: string;

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
  credentialToDelete: string[] = [];

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

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadCredentials();
        }
      }
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
    this.credentialService.listCredentials(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.credentials = response.data.credentials;
        this.filteredCredentials = [...this.credentials];
        this.totalItems = this.credentials.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
      }
    });
  }

  generatePageNumbers() {
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
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
    let filtered = [...this.credentials];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(credential =>
        credential.categoryName.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(user => user.status === this.selectedStatus);
    }

    this.filteredCredentials = filtered;
  }

  onAddNewCredential() {
    // Implement navigation to add new credential
    this.router.navigate([CREDENTIAL.ADD]);
  }

  confirmDelete(id: string) {
    if (id) {
      this.selectedCredCategoryId = id;
      this.showDeleteConfirm = true;
    }
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
  }

  proceedDelete() {
    // Implement delete functionality
    this.credentialService
      .deleteAllCredential(this.selectedOrg.id, this.selectedCredCategoryId)
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.showDeleteConfirm = false;
          this.loadCredentials();
        }
      });
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.applyFilters();
  }

  onDownload(categoryId: string) {
    if (!this.selectedOrg) return;

    this.credentialService
      .downloadCredentials(this.selectedOrg.id, categoryId)
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          const filename = `Credentials_${this.selectedOrg.name}.xlsx`;
          saveAs(response, filename);
        }
      });
  }
}
