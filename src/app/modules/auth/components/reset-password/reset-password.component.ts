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
import { TranslateService } from '@ngx-translate/core';
import { AUTH } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { LocaleService } from 'src/app/core/services/locale.service';
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

  // The link is pre-validated on load (mirrors set-password) so we show the
  // form only for a good token and greet the user by name. 'invalid' also
  // covers expired/used tokens — the BE collapses them for anti-enumeration.
  pageState = signal<'loading' | 'valid' | 'invalid'>('loading');

  // The user's name, returned by verifyResetToken on the 'valid' branch.
  // Empty until the token is confirmed valid (never populated otherwise).
  userName = signal('');

  readonly cardTitle = computed(() => {
    switch (this.pageState()) {
      case 'loading':
        return this.translate.instant('AUTH.RESET.VERIFYING_TITLE');
      case 'invalid':
        return this.translate.instant('AUTH.RESET.INVALID_TITLE');
      default:
        return this.translate.instant('AUTH.RESET.TITLE');
    }
  });

  readonly cardSubtitle = computed(() => {
    if (this.pageState() !== 'valid') return '';
    const name = this.userName().trim();
    return name
      ? this.translate.instant('AUTH.RESET.SUBTITLE_NAMED', { name })
      : this.translate.instant('AUTH.RESET.SUBTITLE');
  });

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private loginService: LoginService,
    private globalService: GlobalService,
    private route: ActivatedRoute,
    private translate: TranslateService,
    private localeService: LocaleService,
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
        // Apply the email link's locale (?lang=, ?locale= fallback) for
        // this session — public route, so AppComponent's handler skips it.
        this.applyLinkLocale(params['lang'] || params['locale']);
        this.userId = params['id'];
        this.orgId = params['orgId'];
        this.token = params['token'];
        // A magic link missing any of id / orgId / token can't complete a
        // reset — bounce to login rather than render a dead form.
        if (!this.userId || !this.orgId || !this.token) {
          this.router.navigate([AUTH.LOGIN]);
          return;
        }
        this.verifyToken();
      });
  }

  private applyLinkLocale(lang: string | undefined): void {
    if (lang && this.localeService.isSupported(lang)) {
      this.localeService.applyTempLocale(lang);
    }
  }

  verifyToken() {
    this.pageState.set('loading');
    this.loginService
      .verifyResetToken(this.userId, this.orgId, this.token)
      .then(res => {
        if (res.status && res.data?.tokenStatus === 'valid') {
          this.userName.set(res.data.fullName ?? '');
          this.pageState.set('valid');
        } else {
          this.pageState.set('invalid');
        }
      })
      .catch(() => this.pageState.set('invalid'));
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
          this.error.set(
            res.message || this.translate.instant('AUTH.RESET_FAILED'),
          );
        }
      } catch (err: any) {
        this.error.set(
          err?.message || this.translate.instant('AUTH.RESET_FAILED_RETRY'),
        );
      } finally {
        this.loading.set(false);
        this.resetPasswordForm.enable({ emitEvent: false });
      }
    }
  }

  getPasswordError(): string {
    const control = this.resetPasswordForm.get('newPassword');
    if (control?.errors?.['required'])
      return this.translate.instant('PASSWORD.REQUIRED');
    if (control?.errors?.['passwordMinLength'])
      return this.translate.instant('PASSWORD.MIN_LENGTH', {
        length: control.errors['passwordMinLength'].requiredLength,
      });
    if (control?.errors?.['passwordMaxLength'])
      return this.translate.instant('PASSWORD.MAX_LENGTH', {
        length: control.errors['passwordMaxLength'].requiredLength,
      });
    if (control?.errors?.['passwordNoSpaces'])
      return this.translate.instant('PASSWORD.NO_SPACES');
    if (control?.errors?.['passwordLowercase'])
      return this.translate.instant('PASSWORD.LOWERCASE');
    if (control?.errors?.['passwordUppercase'])
      return this.translate.instant('PASSWORD.UPPERCASE');
    if (control?.errors?.['passwordDigit'])
      return this.translate.instant('PASSWORD.DIGIT');
    if (control?.errors?.['passwordSpecial'])
      return this.translate.instant('PASSWORD.SPECIAL');
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
