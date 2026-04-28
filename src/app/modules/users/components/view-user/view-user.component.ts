import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { USER } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-view-user',
  templateUrl: './view-user.component.html',
  styleUrls: ['./view-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewUserComponent implements OnInit {
  userId: string = '';
  userData: any;
  showDeleteConfirm = false;
  deleteJustification = '';
  avatarBackground: string = '';
  userInitials: string = '';
  loggedInUserId = this.globalService.getTokenDetails('userId');
  showChangePasswordDialog = false;
  orgId: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.userId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadAdminData();
  }

  async loadAdminData() {
    await this.userService.loadOne(this.orgId, this.userId);
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
        this.orgId,
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
    const res: any = await this.userService.unlock(this.orgId, this.userId);
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
