import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';

import { GROUP } from 'src/app/constants/routes';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-list-group',
  templateUrl: './list-group.component.html',
  styleUrls: ['./list-group.component.scss'],
})
export class ListGroupComponent implements OnInit {
  // PrimeNG Table handles pagination and filtering locally
  limit = 1000;

  groups: any[] = [];
  filteredGroups: any[] = []; // Compat

  searchTerm: string = '';
  showDeleteConfirm = false;
  groupToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  constructor(
    private groupService: GroupService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadGroups();
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
          this.loadGroups();
        }
      }
    });
  }

  onOrgChange(orgId: any) {
    this.selectedOrg = orgId;
    this.loadGroups();
  }

  loadGroups() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg,
      pageNumber: 1,
      limit: this.limit,
    };

    this.groupService.listGroupps(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.groups = response.data.groups || [];
        this.filteredGroups = [...this.groups];
      }
    });
  }

  onAddNewCategory() {
    this.router.navigate([GROUP.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([GROUP.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string) {
    this.groupToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
  }

  proceedDelete() {
    if (this.groupToDelete) {
      this.groupService
        .deleteGroup(this.selectedOrg, this.groupToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadGroups();
            this.showDeleteConfirm = false;
            this.groupToDelete = null;
          }
        });
    }
  }
}
