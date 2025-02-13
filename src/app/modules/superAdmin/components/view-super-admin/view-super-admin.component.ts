import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SuperAdminService } from '../../services/superAdmin.service';
import { MessageService } from 'primeng/api';

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

  constructor(
    private route: ActivatedRoute,
    private superAdminService: SuperAdminService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    // Get admin ID from route params
    this.route.params.subscribe(params => {
      this.adminId = params['id'];
      if (this.adminId) {
        this.loadAdminDetails();
      }
    });
  }

  private loadAdminDetails(): void {
    this.superAdminService.viewSuperAdmin(this.adminId).subscribe({
      next: (response: any) => {
        if (response.status) {
          this.adminData = response.data;
          this.setAdminInitials();
          this.generateAvatarColor();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load admin details',
          });
        }
      },
      error: error => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to load admin details',
        });
      },
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
}
