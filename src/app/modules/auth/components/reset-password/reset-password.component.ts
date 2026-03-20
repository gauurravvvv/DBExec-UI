import { Component, OnInit, QueryList, ViewChildren, ElementRef } from '@angular/core';
import { FormGroup, UntypedFormBuilder, UntypedFormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RESET_PASSWORD_PAGE_OPTIONS } from 'src/app/constants/global';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import { AUTH } from 'src/app/constants/routes';
import { passwordStrengthValidator } from 'src/app/shared/validators/password-strength.validator';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
})
export class ResetPasswordComponent implements OnInit {
  resetPasswordForm: FormGroup;
  showPassword = false;
  features = RESET_PASSWORD_PAGE_OPTIONS;
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
      this.otpControls.push(new UntypedFormControl('', [Validators.required, Validators.pattern(/^[A-Za-z0-9]$/)]));
    }

    this.resetPasswordForm = this.fb.group(
      {
        newPassword: [
          '',
          [Validators.required, passwordStrengthValidator()],
        ],
        confirmPassword: [
          '',
          [Validators.required],
        ],
      },
      {
        validator: this.passwordMatchValidator,
      },
    );
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.userId = params['id'];
      this.orgId = params['orgId'];
      if (!this.userId || !this.orgId) {
        this.router.navigate([AUTH.LOGIN]);
      }
    });
  }

  get otpValue(): string {
    return this.otpControls.map(c => c.value).join('').toUpperCase();
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
    const pasted = (event.clipboardData?.getData('text') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, this.otpLength);
    const inputs = this.otpInputs.toArray();

    for (let i = 0; i < this.otpLength; i++) {
      this.otpControls[i].setValue(i < pasted.length ? pasted[i] : '');
    }

    // Focus the next empty box or the last filled one
    const focusIndex = Math.min(pasted.length, this.otpLength - 1);
    inputs[focusIndex].nativeElement.focus();
    this.otpInvalid = false;
  }

  onSubmit() {
    if (!this.isOtpComplete) {
      this.otpInvalid = true;
      this.otpControls.forEach(c => c.markAsTouched());
      return;
    }

    if (this.isFormValid) {
      const { newPassword } = this.resetPasswordForm.value;
      const otp = this.otpValue;
      this.loginService
        .resetPassword(this.resetPasswordForm, this.userId, this.orgId, otp)
        .then(res => {
          if (this.globalService.handleSuccessService(res)) {
            this.router.navigate([AUTH.LOGIN], { replaceUrl: true });
          }
        });
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

  togglePassword(event: Event, id: string) {
    event.stopPropagation();
    this.showPassword = !this.showPassword;
    const input = document.getElementById(id) as HTMLInputElement;
    input.type = this.showPassword ? 'text' : 'password';
  }
}
