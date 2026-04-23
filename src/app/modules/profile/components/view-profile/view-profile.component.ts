import {ChangeDetectionStrategy, Component, OnInit, OnDestroy} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { ProfileService } from '../../services/profile.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { AddAnalysesActions } from 'src/app/modules/analyses/store';

@Component({
  selector: 'app-view-profile',
  templateUrl: './view-profile.component.html',
  styleUrls: ['./view-profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewProfileComponent implements OnInit {
  private destroy$ = new Subject<void>();

  profileData: any = null;
  loading = true;
  avatarBackground = '';
  showChangePasswordDialog = false;

  constructor(
    private profileService: ProfileService,
    private globalService: GlobalService,
    private loginService: LoginService,
    private router: Router,
    private store: Store,
  ) {}

  ngOnInit(): void {
    this.loadProfile();
  }

  async loadProfile() {
    try {
      this.loading = true;
      const response = await this.profileService.getProfile();
      if (response?.status) {
        this.profileData = response.data;
        this.avatarBackground = this.generateAvatarColor(
          this.profileData.firstName,
        );
      }
    } catch (error) {
      console.error('Failed to load profile', error);
    } finally {
      this.loading = false;
    }
  }

  get initials(): string {
    if (!this.profileData) return '';
    const first = this.profileData.firstName?.[0] || '';
    const last = this.profileData.lastName?.[0] || '';
    return (first + last).toUpperCase();
  }

  get fullName(): string {
    if (!this.profileData) return '';
    return `${this.profileData.firstName || ''} ${this.profileData.lastName || ''}`.trim();
  }

  get roleLabel(): string {
    switch (this.profileData?.role) {
      case 'SUPER-ADMIN':
        return 'Super Admin';
      case 'ORG-ADMIN':
        return 'Organisation Admin';
      case 'ORG-USER':
        return 'User';
      default:
        return this.profileData?.role || '';
    }
  }

  get isSuperAdmin(): boolean {
    return this.profileData?.role === 'SUPER-ADMIN';
  }

  openChangePasswordDialog() {
    this.showChangePasswordDialog = true;
  }

  onPasswordDialogClose(newPassword: string | null) {
    if (newPassword) {
      this.profileService.changePassword(newPassword).then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.showChangePasswordDialog = false;
          this.logoutAndRedirect();
        }
      });
    } else {
      this.showChangePasswordDialog = false;
    }
  }

  private logoutAndRedirect() {
    this.loginService.logout().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.clearSessionAndNavigate(),
      error: () => this.clearSessionAndNavigate(),
    });
  }

  private clearSessionAndNavigate() {
    this.store.dispatch(AddAnalysesActions.clearAllDatasets());
    localStorage.clear();
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }

  private generateAvatarColor(name: string): string {
    const colors = [
      '#2196F3',
      '#4CAF50',
      '#FF9800',
      '#9C27B0',
      '#00BCD4',
      '#E91E63',
      '#3F51B5',
      '#009688',
      '#FF5722',
      '#607D8B',
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}