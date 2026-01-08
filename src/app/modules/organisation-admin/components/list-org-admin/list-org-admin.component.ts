import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { OrganisationAdminService } from '../../services/organisationAdmin.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ORGANISATION_ADMIN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { ROLES } from 'src/app/constants/user.constant';

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
    private orgAdminService: OrganisationAdminService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadAdmins();
    }
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadAdmins();
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.currentPage = 1;
    this.loadAdmins();
  }

  loadAdmins() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.orgAdminService.listOrganisationAdmin(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.admins = response.data.orgAdmins;
        this.filteredAdmins = [...this.admins];
        this.totalItems = this.admins.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
      }
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
    this.router.navigate([ORGANISATION_ADMIN.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([ORGANISATION_ADMIN.EDIT, this.selectedOrg, id]);
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
        .deleteAdminOrganisation(this.selectedOrg, this.adminToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadAdmins();
            this.showDeleteConfirm = false;
            this.adminToDelete = null;
          }
        });
    }
  }
}
