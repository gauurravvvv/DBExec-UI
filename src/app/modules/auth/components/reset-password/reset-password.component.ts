import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormGroup,
  UntypedFormBuilder,
  UntypedFormControl,
  Validators,
} from '@angular/forms';
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

  otpControls: UntypedFormControl[] = [];
  otpLength = 6;
  otpInvalid = false;

  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
    private route: ActivatedRoute,
  ) {
    for (let i = 0; i < this.otpLength; i++) {
      this.otpControls.push(
        new UntypedFormControl('', [
          Validators.required,
          Validators.pattern(/^[A-Za-z0-9]$/),
        ]),
      );
    }

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
        if (!this.userId || !this.orgId) {
          this.router.navigate([AUTH.LOGIN]);
        }
      });
  }

  trackByIndex(index: number): number {
    return index;
  }

  get otpValue(): string {
    return this.otpControls
      .map(c => c.value)
      .join('')
      .toUpperCase();
  }

  get isOtpComplete(): boolean {
    return this.otpControls.every(c => c.valid);
  }

  get isFormValid(): boolean {
    return this.isOtpComplete && this.resetPasswordForm.valid;
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  onOtpInput(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Only allow alphanumeric
    if (value && !/^[A-Za-z0-9]$/.test(value)) {
      this.otpControls[index].setValue('');
      return;
    }

    // Auto-focus next box
    if (value && index < this.otpLength - 1) {
      const inputs = this.otpInputs.toArray();
      inputs[index + 1].nativeElement.focus();
    }

    this.otpInvalid = false;
  }

  onOtpKeydown(event: KeyboardEvent, index: number) {
    const inputs = this.otpInputs.toArray();

    if (event.key === 'Backspace') {
      if (!this.otpControls[index].value && index > 0) {
        inputs[index - 1].nativeElement.focus();
        this.otpControls[index - 1].setValue('');
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      inputs[index - 1].nativeElement.focus();
    } else if (event.key === 'ArrowRight' && index < this.otpLength - 1) {
      inputs[index + 1].nativeElement.focus();
    }
  }

  onOtpPaste(event: ClipboardEvent) {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') || '')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, this.otpLength);
    const inputs = this.otpInputs.toArray();

    for (let i = 0; i < this.otpLength; i++) {
      this.otpControls[i].setValue(i < pasted.length ? pasted[i] : '');
    }

    // Focus the next empty box or the last filled one
    const focusIndex = Math.min(pasted.length, this.otpLength - 1);
    inputs[focusIndex].nativeElement.focus();
    this.otpInvalid = false;
  }

  async onSubmit(): Promise<void> {
    if (!this.isOtpComplete) {
      this.otpInvalid = true;
      this.otpControls.forEach(c => c.markAsTouched());
      return;
    }

    if (this.isFormValid) {
      this.error.set('');
      this.loading.set(true);
      // Lock both the password form AND the 6 OTP controls (separate
      // FormControls outside the FormGroup) so nothing is editable
      // while the POST is in flight.
      this.resetPasswordForm.disable({ emitEvent: false });
      this.otpControls.forEach(c => c.disable({ emitEvent: false }));
      try {
        const otp = this.otpValue;
        const res: any = await this.loginService.resetPassword(
          this.resetPasswordForm,
          this.userId,
          this.orgId,
          otp,
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
        this.otpControls.forEach(c => c.enable({ emitEvent: false }));
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
