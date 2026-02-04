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
  // PrimeNG Table handles pagination and filtering locally
  limit = 1000;

  filteredAdmins: any[] = []; // Kept for compatibility if needed, otherwise just use admins

  searchTerm: string = '';
  showDeleteConfirm = false;
  adminToDelete: string | null = null;

  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  constructor(
    private orgAdminService: OrganisationAdminService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
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
    this.loadAdmins();
  }

  loadAdmins() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      pageNumber: 1,
      limit: this.limit,
    };

    this.orgAdminService.listOrganisationAdmin(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.admins = response.data.orgAdmins || [];
        this.filteredAdmins = [...this.admins];
      }
    });
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
