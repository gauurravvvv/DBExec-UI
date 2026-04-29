import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { AddAnalysesActions } from 'src/app/modules/analyses/store';
import { ProfileService } from '../../services/profile.service';

@Component({
  selector: 'app-view-profile',
  templateUrl: './view-profile.component.html',
  styleUrls: ['./view-profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewProfileComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  profile = this.profileService.profile;
  loading = this.profileService.loading;

  avatarBackground = computed(() =>
    this.generateAvatarColor(this.profile()?.firstName ?? ''),
  );
  showChangePasswordDialog = signal(false);

  constructor(
    private profileService: ProfileService,
    private globalService: GlobalService,
    private loginService: LoginService,
    private router: Router,
    private store: Store,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.profileService.loadProfile();
  }

  get initials(): string {
    const p = this.profile();
    if (!p) return '';
    const first = p.firstName?.[0] || '';
    const last = p.lastName?.[0] || '';
    return (first + last).toUpperCase();
  }

  get fullName(): string {
    const p = this.profile();
    if (!p) return '';
    return `${p.firstName || ''} ${p.lastName || ''}`.trim();
  }

  get roleLabel(): string {
    const p = this.profile();
    switch (p?.role) {
      case 'SYSTEM-ADMIN':
        return this.translate.instant('PROFILE.ROLE_SYSTEM_ADMIN');
      case 'ORG-ADMIN':
        return this.translate.instant('PROFILE.ROLE_ORG_ADMIN');
      case 'ORG-USER':
        return this.translate.instant('PROFILE.ROLE_ORG_USER');
      default:
        return p?.role || '';
    }
  }

  openChangePasswordDialog() {
    this.showChangePasswordDialog.set(true);
  }

  onPasswordDialogClose(newPassword: string | null) {
    if (newPassword) {
      this.profileService.changePassword(newPassword).then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.showChangePasswordDialog.set(false);
          this.logoutAndRedirect();
        }
      });
    } else {
      this.showChangePasswordDialog.set(false);
    }
  }

  private logoutAndRedirect() {
    this.loginService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.clearSessionAndNavigate(),
        error: () => this.clearSessionAndNavigate(),
      });
  }

  private clearSessionAndNavigate() {
    this.store.dispatch(AddAnalysesActions.clearAllDatasets());
    StorageService.clear();
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
}
