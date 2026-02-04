import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-list-users',
  templateUrl: './list-users.component.html',
  styleUrls: ['./list-users.component.scss'],
})
export class ListUsersComponent implements OnInit {
  users: any[] = [];
  // PrimeNG Table handles pagination and filtering locally
  limit = 1000;

  filteredUsers: any[] = []; // Compat

  searchTerm: string = '';
  showDeleteConfirm = false;
  userToDelete: string | null = null;

  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  constructor(
    private userService: UserService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadUsers();
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
          this.selectedOrg = this.organisations[0].id;
          this.loadUsers();
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadUsers();
  }

  loadUsers() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      pageNumber: 1,
      limit: this.limit,
    };

    this.userService.listUser(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.users = response.data.users || [];
        this.filteredUsers = [...this.users];
      }
    });
  }

  onAddNewAdmin() {
    this.router.navigate([USER.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([USER.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.userToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.userToDelete = null;
  }

  proceedDelete() {
    if (this.userToDelete) {
      this.userService
        .deleteUser(this.userToDelete, this.selectedOrg)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadUsers();
            this.showDeleteConfirm = false;
            this.userToDelete = null;
          }
        });
    }
  }
}
