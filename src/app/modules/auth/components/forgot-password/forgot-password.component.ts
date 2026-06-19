import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormGroup, UntypedFormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import {
  emailSchema,
  organisationSchema,
  usernameSchema,
} from 'src/app/shared/validators/auth';
import { zodValidator } from 'src/app/shared/validators/zod-validator';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements OnInit, OnDestroy {
  forgotPasswordForm: FormGroup;
  loading = signal(false);
  error = signal('');

  otpSent = signal(false);
  countdownDisplay = signal('');
  canResend = signal(false);
  private countdownInterval: any;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
  ) {
    // Field validators sourced from the SHARED Zod schema at
    // src/app/shared/validators/auth.ts (mirrored to BE).
    this.forgotPasswordForm = this.fb.group({
      organisation: ['', [zodValidator(organisationSchema)]],
      username: ['', [zodValidator(usernameSchema)]],
      email: ['', [zodValidator(emailSchema)]],
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.clearCountdown();
  }

  trackByIndex(index: number): number {
    return index;
  }

  getErrorMessage(fieldName: string): string {
    const control = this.forgotPasswordForm.get(fieldName);
    if (!control?.errors) return '';
    if (control.errors['required']) {
      switch (fieldName) {
        case 'organisation':
          return 'Organisation is required';
        case 'username':
          return 'Username is required';
        case 'email':
          return 'Email is required';
        default:
          return 'This field is required';
      }
    }
    if (control.errors['email']) return 'Please enter a valid email address';
    return '';
  }

  async onSubmit(): Promise<void> {
    if (this.forgotPasswordForm.valid) {
      this.error.set('');
      this.loading.set(true);
      // Lock the form while the POST is in flight so the user can't
      // edit fields mid-request and re-fire submit.
      this.forgotPasswordForm.disable({ emitEvent: false });
      try {
        const res: any = await this.loginService.generateOTP(
          this.forgotPasswordForm,
        );
        this.globalService.handleSuccessService(res);
        if (res.data?.otpExpiresAt) {
          this.startCountdown(new Date(res.data.otpExpiresAt));
        } else if (!res.status) {
          this.error.set(res.message || 'Failed to send OTP.');
        }
      } catch (err: any) {
        this.error.set(err?.message || 'Failed to send OTP. Please try again.');
      } finally {
        this.loading.set(false);
        this.forgotPasswordForm.enable({ emitEvent: false });
      }
    }
  }

  private startCountdown(expiresAt: Date): void {
    this.clearCountdown();
    this.otpSent.set(true);
    this.canResend.set(false);
    this.updateCountdown(expiresAt);
    this.countdownInterval = setInterval(() => {
      this.updateCountdown(expiresAt);
    }, 1000);
  }

  private updateCountdown(expiresAt: Date): void {
    const remainingMs = expiresAt.getTime() - Date.now();
    if (remainingMs <= 0) {
      this.countdownDisplay.set('');
      this.canResend.set(true);
      this.clearCountdown();
      return;
    }
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    this.countdownDisplay.set(
      `${minutes}:${seconds.toString().padStart(2, '0')}`,
    );
  }

  private clearCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
}
