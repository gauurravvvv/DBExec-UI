import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SuperAdminService } from '../../services/superAdmin.service';
import { MessageService } from 'primeng/api';
import { GlobalService } from 'src/app/core/services/global.service';
import { SUPER_ADMIN } from 'src/app/constants/routes';

interface AdminData {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  mobile: string;
  createdOn: string;
  status: number;
  lastLogin: string | null;
  organisationName: string;
  organisationId: number;
  role: string;
  isFirstLogin: boolean;
  isDefault: number;
}

@Component({
  selector: 'app-view-super-admin',
  templateUrl: './view-super-admin.component.html',
  styleUrls: ['./view-super-admin.component.scss'],
})
export class ViewSuperAdminComponent implements OnInit {
  adminId: string = '';
  adminData: AdminData | null = null;
  adminInitials: string = '';
  avatarBackground: string = '#2196F3'; // Default blue color
  loggedInUserId: any;
  adminIdToDelete: string | null = null;
  showDeleteConfirm = false;
  showChangePasswordDialog = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private superAdminService: SuperAdminService,
    private messageService: MessageService,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    // Get admin ID from route params
    this.loggedInUserId = this.globalService.getTokenDetails('userId');

    this.route.params.subscribe(params => {
      this.adminId = params['id'];
      if (this.adminId) {
        this.loadAdminDetails();
      }
    });
  }

  private loadAdminDetails(): void {
    this.superAdminService
      .viewSuperAdmin(this.adminId)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.adminData = response.data;
          this.setAdminInitials();
          this.generateAvatarColor();
        }
      });
  }

  private setAdminInitials(): void {
    if (this.adminData) {
      console.log(this.adminData);
      const firstInitial = this.adminData.firstName.charAt(0).toUpperCase();
      const lastInitial = this.adminData.lastName.charAt(0).toUpperCase();
      this.adminInitials = `${firstInitial}${lastInitial}`;
    }
  }

  private generateAvatarColor(): void {
    // Generate a consistent color based on the admin's username
    if (this.adminData?.username) {
      const colors = [
        '#1976D2', // Blue
        '#388E3C', // Green
        '#D32F2F', // Red
        '#7B1FA2', // Purple
        '#C2185B', // Pink
        '#FFA000', // Amber
        '#00796B', // Teal
        '#5D4037', // Brown
      ];

      // Generate a number from username string
      const hash = this.adminData.username
        .split('')
        .reduce((acc, char) => char.charCodeAt(0) + acc, 0);

      // Use the hash to select a color
      this.avatarBackground = colors[hash % colors.length];
    }
  }

  confirmDelete(adminId: string) {
    this.adminIdToDelete = adminId;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminIdToDelete = null;
  }

  proceedDelete() {
    if (this.adminIdToDelete) {
      this.onDelete(this.adminIdToDelete);
      this.showDeleteConfirm = false;
      this.adminIdToDelete = null;
    }
  }

  onDelete(adminId: string) {
    this.superAdminService
      .deleteSuperAdmin(Number(adminId))
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.router.navigate([SUPER_ADMIN.LIST]);
        }
      });
  }

  openChangePasswordDialog() {
    this.showChangePasswordDialog = true;
  }

  onPasswordDialogClose(newPassword: string | null) {
    if (newPassword) {
      this.superAdminService
        .updateSuperAdminPassword(this.adminId, newPassword)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.showChangePasswordDialog = false;
          }
        });
    } else {
      this.showChangePasswordDialog = false;
    }
  }
}
