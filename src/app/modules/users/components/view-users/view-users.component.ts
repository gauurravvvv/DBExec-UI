import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ORGANISATION_ADMIN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-view-users',
  templateUrl: './view-users.component.html',
  styleUrls: ['./view-users.component.scss'],
})
export class ViewUsersComponent implements OnInit {
  userId: string = '';
  userData: any;
  showDeleteConfirm = false;
  avatarBackground: string = '';
  userInitials: string = '';
  loggedInUserId = this.globalService.getTokenDetails('userId');
  showChangePasswordDialog = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.userId = this.route.snapshot.params['id'];
    this.loadAdminData();
  }

  loadAdminData() {
    this.userService.viewOrgUser(this.userId).subscribe({
      next: (response: any) => {
        this.userData = response.data;
        this.setAdminInitials();
        this.generateAvatarBackground();
      },
      error: error => {
        console.error('Error loading admin data:', error);
      },
    });
  }

  setAdminInitials() {
    if (this.userData) {
      const firstInitial = this.userData.firstName.charAt(0);
      const lastInitial = this.userData.lastName.charAt(0);
      this.userInitials = (firstInitial + lastInitial).toUpperCase();
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
    this.userService.deleteUser(this.userId).subscribe({
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
      this.userService.updateUserPassword(this.userId, newPassword).subscribe({
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
