import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormGroup, UntypedFormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { LocaleService } from 'src/app/core/services/locale.service';
import { LoginService } from 'src/app/core/services/login.service';
import {
  emailSchema,
  organisationSchema,
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
    private route: ActivatedRoute,
    private translate: TranslateService,
    private localeService: LocaleService,
  ) {
    // Field validators sourced from the SHARED Zod schema at
    // src/app/shared/validators/auth.ts (mirrored to BE).
    this.forgotPasswordForm = this.fb.group({
      organisation: ['', [zodValidator(organisationSchema)]],
      email: ['', [zodValidator(emailSchema)]],
    });
  }

  ngOnInit(): void {
    // Honour a locale carried on the URL (?lang= / ?locale=) — this page
    // can be linked from a localized email or the login page.
    const params = this.route.snapshot.queryParams;
    const lang = params['lang'] || params['locale'];
    if (lang && this.localeService.isSupported(lang)) {
      this.localeService.applyTempLocale(lang);
    }
  }

  ngOnDestroy(): void {
    this.clearCountdown();
  }

  getErrorMessage(fieldName: string): string {
    const control = this.forgotPasswordForm.get(fieldName);
    if (!control?.errors) return '';
    if (control.errors['required']) {
      switch (fieldName) {
        case 'organisation':
          return this.translate.instant('validation.auth.organisation.required');
        case 'email':
          return this.translate.instant('validation.auth.email.required');
        default:
          return this.translate.instant('VALIDATION.FIELD_REQUIRED');
      }
    }
    if (control.errors['email'])
      return this.translate.instant('validation.auth.email.invalid');
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
        // The BE returns `expiresAt` on EVERY success — real send, rate-limit,
        // or an anti-enumeration masked non-send (synthetic expiry). So the
        // countdown renders identically regardless of whether the account
        // exists: the UI must not become an existence oracle.
        if (res.data?.expiresAt) {
          this.startCountdown(new Date(res.data.expiresAt));
        } else if (!res.status) {
          this.error.set(
            res.message || this.translate.instant('AUTH.FORGOT.FAILED'),
          );
        }
      } catch (err: any) {
        this.error.set(
          err?.message || this.translate.instant('AUTH.FORGOT.FAILED_RETRY'),
        );
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
