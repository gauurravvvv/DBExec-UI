import {ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SET_PASSWORD_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { AUTH } from 'src/app/constants/routes';
import { StorageService } from 'src/app/core/services/storage.service';
import { passwordStrengthValidator } from 'src/app/shared/validators/password-strength.validator';

@Component({
  selector: 'app-set-password',
  templateUrl: './set-password.component.html',
  styleUrls: ['./set-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetPasswordComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  setPasswordForm: FormGroup;
  showPassword = false;
  features = SET_PASSWORD_PAGE_OPTIONS;
  loading = signal(false);
  error = signal('');
  userId!: string;
  orgId!: string;
  token!: string;

  pageState:
    | 'loading'
    | 'valid'
    | 'expired'
    | 'already_set'
    | 'invalid'
    | 'resent' = 'loading';
  resending = false;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
    private route: ActivatedRoute,
  ) {
    this.setPasswordForm = this.fb.group(
      {
        newPassword: ['', [Validators.required, passwordStrengthValidator()]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validator: this.passwordMatchValidator,
      },
    );
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.userId = params['id'];
      this.orgId = params['orgId'];
      this.token = params['token'];
      if (!this.userId || !this.orgId || !this.token) {
        this.router.navigate([AUTH.LOGIN]);
        return;
      }
      this.verifyToken();
    });
  }

  verifyToken() {
    this.pageState = 'loading';
    this.loginService
      .verifySetupToken(this.userId, this.orgId, this.token)
      .then(res => {
        if (res.status && res.data?.tokenStatus) {
          this.pageState = res.data.tokenStatus;
          if (this.pageState === 'already_set') {
            setTimeout(() => this.router.navigate([AUTH.LOGIN]), 3000);
          }
        } else {
          this.pageState = 'invalid';
        }
      })
      .catch(() => {});
  }

  resendLink() {
    this.resending = true;
    this.loginService.resendSetupLink(this.userId, this.orgId).then(res => {
      this.resending = false;
      if (this.globalService.handleSuccessService(res)) {
        this.pageState = 'resent';
      }
    }).catch(() => {});
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  async onSubmit(): Promise<void> {
    if (this.setPasswordForm.valid) {
      this.error.set('');
      this.loading.set(true);
      try {
        const { newPassword } = this.setPasswordForm.value;
        const res: any = await this.loginService.setPassword(
          newPassword, this.userId, this.orgId, this.token
        );
        if (this.globalService.handleSuccessService(res)) {
          StorageService.clear();
          this.router.navigate([AUTH.LOGIN], { replaceUrl: true });
        } else {
          this.error.set(res.message || 'Failed to set password.');
        }
      } catch (err: any) {
        this.error.set(err?.message || 'Failed to set password. Please try again.');
      } finally {
        this.loading.set(false);
      }
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  getPasswordError(): string {
    const control = this.setPasswordForm.get('newPassword');
    if (control?.errors?.['required']) return 'Password is required';
    if (control?.errors?.['passwordMinLength'])
      return `Password must be at least ${control.errors['passwordMinLength'].requiredLength} characters`;
    if (control?.errors?.['passwordMaxLength'])
      return `Password must not exceed ${control.errors['passwordMaxLength'].requiredLength} characters`;
    if (control?.errors?.['passwordNoSpaces'])
      return 'Password must not contain spaces';
    if (control?.errors?.['passwordLowercase'])
      return 'Password must contain at least one lowercase letter';
    if (control?.errors?.['passwordUppercase'])
      return 'Password must contain at least one uppercase letter';
    if (control?.errors?.['passwordDigit'])
      return 'Password must contain at least one number';
    if (control?.errors?.['passwordSpecial'])
      return 'Password must contain at least one special character (e.g., @$!%*?&)';
    return '';
  }

  togglePassword(event: Event, id: string) {
    event.stopPropagation();
    this.showPassword = !this.showPassword;
    const input = document.getElementById(id) as HTMLInputElement;
    input.type = this.showPassword ? 'text' : 'password';
  }

}