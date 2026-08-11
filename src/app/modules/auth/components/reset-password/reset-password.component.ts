import {
  ChangeDetectionStrategy,
  Component,
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
import { newPasswordSchema } from 'src/app/shared/validators/auth';
import { passwordStrengthValidator } from 'src/app/shared/validators/password-strength.validator';
import { zodValidator } from 'src/app/shared/validators/zod-validator';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  resetPasswordForm: FormGroup;
  loading = signal(false);
  error = signal('');
  capsLockOn = signal(false);
  passwordFocused = signal(false);
  userId!: string;
  orgId!: string;
  // The 64-char reset token carried in the magic-link URL. Verified
  // server-side; the user never sees or types it.
  token!: string;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
    private route: ActivatedRoute,
  ) {
    // newPassword has BOTH:
    //   - `zodValidator(newPasswordSchema)` — surfaces the FIRST error
    //     key (`errors['zod']`) matching exactly what the BE would
    //     return on submit, so the user gets a consistent message
    //     across FE inline and BE-rejection toasts.
    //   - `passwordStrengthValidator()` — FE-only, surfaces ALL
    //     failing rules at once as individual error keys so the live
    //     "strength indicator" checklist (8 chars, lowercase, etc.)
    //     can light up per rule.
    // Both validators are advisory; the BE schema is the contract.
    this.resetPasswordForm = this.fb.group(
      {
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
        // A magic link missing any of id / orgId / token can't complete a
        // reset — bounce to login rather than render a dead form.
        if (!this.userId || !this.orgId || !this.token) {
          this.router.navigate([AUTH.LOGIN]);
        }
      });
  }

  get isFormValid(): boolean {
    return this.resetPasswordForm.valid;
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  async onSubmit(): Promise<void> {
    if (this.isFormValid) {
      this.error.set('');
      this.loading.set(true);
      this.resetPasswordForm.disable({ emitEvent: false });
      try {
        const res: any = await this.loginService.resetPassword(
          this.resetPasswordForm,
          this.userId,
          this.orgId,
          this.token,
        );
        if (this.globalService.handleSuccessService(res)) {
          this.router.navigate([AUTH.LOGIN], { replaceUrl: true });
        } else {
          this.error.set(res.message || 'Password reset failed.');
        }
      } catch (err: any) {
        this.error.set(
          err?.message || 'Password reset failed. Please try again.',
        );
      } finally {
        this.loading.set(false);
        this.resetPasswordForm.enable({ emitEvent: false });
      }
    }
  }

  getPasswordError(): string {
    const control = this.resetPasswordForm.get('newPassword');
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
}
