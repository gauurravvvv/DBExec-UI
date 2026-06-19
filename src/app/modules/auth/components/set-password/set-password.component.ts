import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AUTH } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { newPasswordSchema } from 'src/app/shared/validators/auth';
import { passwordStrengthValidator } from 'src/app/shared/validators/password-strength.validator';
import { zodValidator } from 'src/app/shared/validators/zod-validator';

@Component({
  selector: 'app-set-password',
  templateUrl: './set-password.component.html',
  styleUrls: ['./set-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetPasswordComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  setPasswordForm: FormGroup;
  loading = signal(false);
  error = signal('');
  capsLockOn = signal(false);
  passwordFocused = signal(false);
  userId!: string;
  orgId!: string;
  token!: string;

  pageState = signal<
    'loading' | 'valid' | 'expired' | 'already_set' | 'invalid' | 'resent'
  >('loading');
  resending = signal(false);

  // Card title + subtitle change with the state so the shell still hosts
  // every variant cleanly.
  readonly cardTitle = computed(() => {
    switch (this.pageState()) {
      case 'loading':
        return 'Verifying link';
      case 'valid':
        return 'Set your password';
      case 'expired':
        return 'Link expired';
      case 'resent':
        return 'Link sent';
      case 'already_set':
        return 'Already set';
      case 'invalid':
        return 'Invalid link';
      default:
        return 'Set your password';
    }
  });

  readonly cardSubtitle = computed(() => {
    return this.pageState() === 'valid'
      ? 'Create a password to activate your account.'
      : '';
  });

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
    private route: ActivatedRoute,
  ) {
    this.setPasswordForm = this.fb.group(
      {
        // newPassword: BE-parity via zodValidator(newPasswordSchema)
        // PLUS the per-rule strength validator for the live checklist
        // (see reset-password.component.ts for the rationale).
        newPassword: [
          '',
          [
            Validators.required,
            zodValidator(newPasswordSchema),
            passwordStrengthValidator(),
          ],
        ],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validator: this.passwordMatchValidator,
      },
    );
  }

  ngOnInit(): void {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
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
    this.pageState.set('loading');
    this.loginService
      .verifySetupToken(this.userId, this.orgId, this.token)
      .then(res => {
        if (res.status && res.data?.tokenStatus) {
          this.pageState.set(res.data.tokenStatus);
          if (this.pageState() === 'already_set') {
            setTimeout(() => this.router.navigate([AUTH.LOGIN]), 3000);
          }
        } else {
          this.pageState.set('invalid');
        }
      })
      .catch(() => {});
  }

  resendLink() {
    this.resending.set(true);
    this.loginService
      .resendSetupLink(this.userId, this.orgId)
      .then(res => {
        this.resending.set(false);
        if (this.globalService.handleSuccessService(res)) {
          this.pageState.set('resent');
        }
      })
      .catch(() => {});
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
      // Lock the form while setPassword is in flight.
      this.setPasswordForm.disable({ emitEvent: false });
      try {
        const { newPassword } = this.setPasswordForm.value;
        const res: any = await this.loginService.setPassword(
          newPassword,
          this.userId,
          this.orgId,
          this.token,
        );
        if (this.globalService.handleSuccessService(res)) {
          StorageService.clear();
          this.router.navigate([AUTH.LOGIN], { replaceUrl: true });
        } else {
          this.error.set(res.message || 'Failed to set password.');
        }
      } catch (err: any) {
        this.error.set(
          err?.message || 'Failed to set password. Please try again.',
        );
      } finally {
        this.loading.set(false);
        this.setPasswordForm.enable({ emitEvent: false });
      }
    }
  }

  @HostListener('document:keydown', ['$event'])
  @HostListener('document:keyup', ['$event'])
  onKeyEvent(event: KeyboardEvent): void {
    if (!this.passwordFocused()) return;
    const next = !!event.getModifierState?.('CapsLock');
    if (next !== this.capsLockOn()) {
      this.capsLockOn.set(next);
    }
  }

  onPasswordFocus(): void {
    this.passwordFocused.set(true);
  }

  onPasswordBlur(): void {
    this.passwordFocused.set(false);
    this.capsLockOn.set(false);
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
}
