import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SYSTEM_ADMIN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { SystemAdminService } from '../../services/system-admin.service';

interface AdminData {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  mobile: string;
  createdOn: string;
  status: number;
  lastLogin: string | null;
  organisationName: string;
  organisationId: string;
  role: string;
  isFirstLogin: boolean;
  isDefault: number;
  canDelete: boolean;
  isLocked: boolean;
}

@Component({
  selector: 'app-view-system-admin',
  templateUrl: './view-system-admin.component.html',
  styleUrls: ['./view-system-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewSystemAdminComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  adminId: string = '';
  adminData: AdminData | null = null;
  adminInitials: string = '';
  avatarBackground: string = '#2196F3'; // Default blue color
  loggedInUserId: any;
  adminIdToDelete: string | null = null;
  showDeleteConfirm = false;
  deleteJustification = '';
  showChangePasswordDialog = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private systemAdminService: SystemAdminService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Get admin ID from route params
    this.loggedInUserId = this.globalService.getTokenDetails('userId');

    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.adminId = params['id'];
        if (this.adminId) {
          this.loadAdminDetails();
        }
      });
  }

  private async loadAdminDetails(): Promise<void> {
    await this.systemAdminService.loadOne(this.adminId);
    const data = this.systemAdminService.current();
    if (data) {
      this.adminData = data;
      this.setAdminInitials();
      this.generateAvatarColor();
      this.cdr.markForCheck();
    }
  }

  private setAdminInitials(): void {
    if (this.adminData) {
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
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.adminIdToDelete && this.deleteJustification.trim()) {
      this.onDelete(this.adminIdToDelete);
      this.showDeleteConfirm = false;
      this.adminIdToDelete = null;
      this.deleteJustification = '';
    }
  }

  onDelete(adminId: string) {
    this.systemAdminService
      .delete(adminId, this.deleteJustification.trim())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.router.navigate([SYSTEM_ADMIN.LIST]);
        }
        this.cdr.markForCheck();
      });
  }

  onUnlock() {
    this.systemAdminService.unlock(this.adminId).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        this.loadAdminDetails();
      }
      this.cdr.markForCheck();
    });
  }

  openChangePasswordDialog() {
    this.showChangePasswordDialog = true;
  }

  onPasswordDialogClose(newPassword: string | null) {
    if (newPassword) {
      this.systemAdminService
        .updatePassword(this.adminId, newPassword)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.showChangePasswordDialog = false;
          }
          this.cdr.markForCheck();
        });
    } else {
      this.showChangePasswordDialog = false;
    }
  }
}
