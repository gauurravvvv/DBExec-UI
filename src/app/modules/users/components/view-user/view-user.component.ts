import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { USER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-view-user',
  templateUrl: './view-user.component.html',
  styleUrls: ['./view-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewUserComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.userService.cancelReads();
  }

  userId: string = '';
  userData: any;
  showDeleteConfirm = false;
  deleteJustification = '';
  avatarBackground: string = '';
  userInitials: string = '';
  loggedInUserId = this.globalService.getTokenDetails('userId');
  showChangePasswordDialog = false;
  // Skeleton gating + per-action spinners; matches the system-admin
  // view-page shape (page chrome visible, body swaps to skeleton card
  // while the GET is in flight).
  loading = this.userService.loading;
  changingPassword = this.userService.changingPassword;
  isDeleting = (id: string): boolean => this.userService.isDeleting(id);
  isUnlocking = (id: string): boolean => this.userService.isUnlocking(id);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.userId = this.route.snapshot.params['id'];
    this.loadAdminData();
  }

  async loadAdminData() {
    await this.userService.loadOne(this.userId);
    const data = this.userService.current();
    if (data) {
      this.userData = data;
      this.setAdminInitials();
      this.generateAvatarBackground();
    }
    this.cdr.markForCheck();
  }

  setAdminInitials() {
    if (this.userData) {
      // Derive initials from the single full-name field: first + last
      // token for a multi-word name, else the first two chars of a
      // single-word (mononym) name.
      const parts = (this.userData.fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (parts.length >= 2) {
        this.userInitials = (
          parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
        ).toUpperCase();
      } else if (parts.length === 1) {
        this.userInitials = parts[0].slice(0, 2).toUpperCase();
      } else {
        this.userInitials = '';
      }
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

  /** Wired up by the Edit button; gated by `userData?.canEdit` in
   *  the template so this never fires for default-user / self
   *  cases. */
  goToEdit() {
    this.router.navigate(['/app/users', this.userId, 'edit']);
  }

  goBack(): void {
    this.router.navigate([USER.LIST]);
  }

  confirmDelete() {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  async proceedDelete() {
    if (this.deleteJustification.trim()) {
      const response = await this.userService.delete(
        this.userId,
        this.deleteJustification.trim(),
      );
      if (this.globalService.handleSuccessService(response)) {
        this.deleteJustification = '';
        this.router.navigate([USER.LIST]);
      }
      this.cdr.markForCheck();
    }
  }

  async onUnlock() {
    const res: any = await this.userService.unlock(this.userId);
    if (this.globalService.handleSuccessService(res)) {
      this.loadAdminData();
    }
  }

  openChangePasswordDialog() {
    this.showChangePasswordDialog = true;
  }

  async onPasswordDialogClose(newPassword: string | null) {
    if (newPassword) {
      const response = await this.userService.updatePassword(
        this.userId,
        newPassword,
      );
      if (this.globalService.handleSuccessService(response)) {
        this.showChangePasswordDialog = false;
      }
      this.cdr.markForCheck();
    } else {
      this.showChangePasswordDialog = false;
    }
  }
}
