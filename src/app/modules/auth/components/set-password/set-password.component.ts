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

  // The user's name, returned by verifySetupToken on the 'valid' branch so we
  // can greet them by name on the form. Empty until the token is confirmed
  // valid (never populated on invalid/expired paths — see the BE controller's
  // anti-enumeration note).
  userName = signal('');

  // Card title + subtitle change with the state so the shell still hosts
  // every variant cleanly. Strings resolve through the translate service so
  // the page renders in the email link's locale.
  readonly cardTitle = computed(() => {
    switch (this.pageState()) {
      case 'loading':
        return this.translate.instant('AUTH.SET.VERIFYING_TITLE');
      case 'valid':
        return this.translate.instant('AUTH.SET.TITLE');
      case 'expired':
        return this.translate.instant('AUTH.SET.EXPIRED_TITLE');
      case 'resent':
        return this.translate.instant('AUTH.SET.SENT_TITLE');
      case 'already_set':
        return this.translate.instant('AUTH.SET.ALREADY_TITLE');
      case 'invalid':
        return this.translate.instant('AUTH.SET.INVALID_TITLE');
      default:
        return this.translate.instant('AUTH.SET.TITLE');
    }
  });

  readonly cardSubtitle = computed(() => {
    if (this.pageState() !== 'valid') return '';
    const name = this.userName().trim();
    return name
      ? this.translate.instant('AUTH.SET.SUBTITLE_NAMED', { name })
      : this.translate.instant('AUTH.SET.SUBTITLE');
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
        // The email link carries the recipient's locale (?lang=, with
        // ?locale= as a fallback). Apply it for this session so the whole
        // page renders in the language the invite was sent in. This is a
        // public route (not under /app), so AppComponent's locale handler
        // doesn't cover it — we apply it here.
        this.applyLinkLocale(params['lang'] || params['locale']);
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

  private applyLinkLocale(lang: string | undefined): void {
    if (lang && this.localeService.isSupported(lang)) {
      this.localeService.applyTempLocale(lang);
    }
  }

  verifyToken() {
    this.pageState.set('loading');
    this.loginService
      .verifySetupToken(this.userId, this.orgId, this.token)
      .then(res => {
        if (res.status && res.data?.tokenStatus) {
          this.userName.set(res.data.fullName ?? '');
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
          this.error.set(
            res.message ||
              this.translate.instant('AUTH.SET_PASSWORD_FAILED'),
          );
        }
      } catch (err: any) {
        this.error.set(
          err?.message ||
            this.translate.instant('AUTH.SET_PASSWORD_FAILED_RETRY'),
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
}
