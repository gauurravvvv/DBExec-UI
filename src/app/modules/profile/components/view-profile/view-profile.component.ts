import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnDestroy,
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
export class ViewProfileComponent implements OnInit, OnDestroy {
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

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.profileService.cancelReads();
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

  /**
   * Role label — joins every role NAME the user carries via their
   * groups. A user can belong to many groups, each with one role, so
   * the label needs to surface all of them ("Administrator, Auditor"
   * rather than just the BE-picked primary).
   *
   * Falls back to the primary `role` field when the BE didn't return
   * `roleNames` (older payloads), then to empty.
   */
  get roleLabel(): string {
    const p = this.profile() as
      | { role?: string; roleNames?: string[] }
      | null;
    if (!p) return '';
    if (Array.isArray(p.roleNames) && p.roleNames.length > 0) {
      return p.roleNames.join(', ');
    }
    return p.role || '';
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
