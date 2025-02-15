import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganisationAdminService } from '../../services/organisationAdmin.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION_ADMIN } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';

@Component({
  selector: 'app-view-org-admin',
  templateUrl: './view-org-admin.component.html',
  styleUrls: ['./view-org-admin.component.scss'],
})
export class ViewOrgAdminComponent implements OnInit {
  adminId: string = '';
  adminData: any;
  showDeleteConfirm = false;
  avatarBackground: string = '';
  adminInitials: string = '';
  loggedInUserId = this.globalService.getTokenDetails('userId');
  showOrganisationInfo =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  showChangePassword =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  showChangePasswordDialog = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private orgAdminService: OrganisationAdminService,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.adminId = this.route.snapshot.params['id'];
    this.loadAdminData();
  }

  loadAdminData() {
    this.orgAdminService.viewOrganisationAdmin(this.adminId).subscribe({
      next: (response: any) => {
        this.adminData = response.data;
        this.setAdminInitials();
        this.generateAvatarBackground();
      },
      error: error => {
        console.error('Error loading admin data:', error);
      },
    });
  }

  setAdminInitials() {
    if (this.adminData) {
      const firstInitial = this.adminData.firstName.charAt(0);
      const lastInitial = this.adminData.lastName.charAt(0);
      this.adminInitials = (firstInitial + lastInitial).toUpperCase();
    }
  }

  generateAvatarBackground() {
    const colors = [
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#96CEB4',
      '#FFEEAD',
      '#D4A5A5',
      '#9B59B6',
      '#0078d3',
    ];
    const randomIndex = Math.floor(Math.random() * colors.length);
    this.avatarBackground = colors[randomIndex];
  }

  confirmDelete(id: string) {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
  }

  proceedDelete() {
    this.orgAdminService.deleteAdminOrganisation(this.adminId).subscribe({
      next: () => {
        this.router.navigate([ORGANISATION_ADMIN.LIST]);
      },
      error: error => {
        console.error('Error deleting organisation admin:', error);
      },
    });
  }

  openChangePasswordDialog() {
    this.showChangePasswordDialog = true;
  }

  onPasswordDialogClose(newPassword: string | null) {
    if (newPassword) {
      this.orgAdminService
        .updateOrgAdminPassword(this.adminId, newPassword)
        .subscribe({
          next: response => {
            this.globalService.handleAPIResponse({
              status: true,
              message: response.message,
            });
          },
          error: error => {
            this.globalService.handleAPIResponse({
              status: false,
              message:
                error?.error?.message ||
                error?.message ||
                'Failed to update password',
            });
          },
        });
    }
    this.showChangePasswordDialog = false;
  }
}
