import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ENVIRONMENT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { EnvironmentService } from '../../services/environment.service';

@Component({
  selector: 'app-list-environment',
  templateUrl: './list-environment.component.html',
  styleUrls: ['./list-environment.component.scss'],
})
export class ListEnvironmentComponent implements OnInit {
  envs: any[] = [];
  filteredEnvs: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  envToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

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
    private environmentService: EnvironmentService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadEnvs();
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
          this.loadEnvs();
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
    this.loadEnvs();
  }

  loadEnvs() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.environmentService.listEnvironments(params).subscribe({
      next: (response: any) => {
        this.envs = response.data.envs;
        this.filteredEnvs = [...this.envs];
        this.totalItems = this.envs.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
      },
      error: error => {
        console.error('Error loading envs:', error);
      },
    });
  }

  generatePageNumbers() {
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.loadEnvs();
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
    let filtered = [...this.envs];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(env =>
        env.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(env => env.status === this.selectedStatus);
    }

    this.filteredEnvs = filtered;
  }

  onAddNewEnvironment() {
    this.router.navigate([ENVIRONMENT.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([ENVIRONMENT.EDIT, this.selectedOrg.id, id], {
      queryParams: {
        orgId: this.selectedOrg.id,
        adminId: id,
      },
    });
  }

  confirmDelete(id: string) {
    this.envToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.envToDelete = null;
  }

  proceedDelete() {
    if (this.envToDelete) {
      this.environmentService.deleteEnvironment(this.envToDelete).subscribe({
        next: () => {
          this.loadEnvs();
          this.showDeleteConfirm = false;
          this.envToDelete = null;
        },
        error: error => {
          console.error('Error deleting env:', error);
          this.showDeleteConfirm = false;
          this.envToDelete = null;
        },
      });
    }
  }
}
