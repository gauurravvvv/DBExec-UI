import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  signal,
} from '@angular/core';
import { FormGroup, UntypedFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ROLES } from 'src/app/core/constants/user.constant';
import { HOME_ROUTES } from 'src/app/core/layout/sidebar/sidebar.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';

// Single generic message for any "wrong identifier or credential" outcome.
// Specific server-side reasons (lockout, downtime, etc.) still pass through.
const GENERIC_AUTH_ERROR = 'The credentials you entered are incorrect.';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  loading = signal(false);
  loginError = signal('');
  // True once the user has tried to submit at least once — gates field-level
  // error visibility so the form doesn't shout at users mid-typing.
  submitAttempted = signal(false);
  // True while the Password field has focus AND the OS Caps Lock is on.
  // Detected from keydown/keyup on the password input.
  capsLockOn = signal(false);
  passwordFocused = signal(false);

  private returnUrl: string | null = null;

  constructor(
    private fb: UntypedFormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private loginService: LoginService,
    private globalService: GlobalService,
  ) {
    // Only `required` on login. Format / strength rules belong on sign-up
    // and reset flows — at sign-in, the server is the source of truth.
    // Client-side pattern checks here would block legacy accounts and leak
    // hints about the current password policy.
    this.loginForm = this.fb.group({
      organisation: ['', [Validators.required]],
      username: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
  }

  async onSubmit(): Promise<void> {
    // Double-submit guard — Enter on a non-disabled button could otherwise
    // re-enter while a request is in flight.
    if (this.loading()) return;
    this.submitAttempted.set(true);
    if (!this.loginForm.valid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.loginError.set('');
    this.loading.set(true);
    // Lock the form while the POST is in flight. Without this the
    // user could keep typing after hitting Enter, which would make
    // [disabled]=loginForm.invalid flip to enabled mid-request and
    // re-fire onSubmit. emitEvent:false keeps the valueChanges
    // pipeline quiet during the lock/unlock pair.
    this.loginForm.disable({ emitEvent: false });
    try {
      const res: any = await this.loginService.login(this.loginForm);
      if (this.globalService.handleSuccessService(res, true, false)) {
        const role = this.globalService.getTokenDetails('role');
        const homeRoute =
          role === ROLES.SYSTEM_ADMIN
            ? HOME_ROUTES.SYSTEM_ADMIN
            : HOME_ROUTES.ORG_ADMIN;
        const target = this.returnUrl || homeRoute;
        this.router.navigateByUrl(target, {
          replaceUrl: true,
        });
      } else {
        this.loginError.set(this.normaliseAuthError(res?.message));
      }
    } catch (err: any) {
      this.loginError.set(
        this.normaliseAuthError(err?.message) || GENERIC_AUTH_ERROR,
      );
    } finally {
      this.loading.set(false);
      this.loginForm.enable({ emitEvent: false });
    }
  }

  // Caps Lock detection. We attach to the host so the listener exists from
  // mount; only fires the signal change when the password is focused.
  @HostListener('document:keydown', ['$event'])
  @HostListener('document:keyup', ['$event'])
  onKeyEvent(event: KeyboardEvent): void {
    if (!this.passwordFocused()) return;
    // getModifierState exists on real KeyboardEvent and is the canonical way
    // to read modifier state without inferring from key codes.
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

  getErrorMessage(fieldName: string): string {
    // Hide field-level errors until the user has tried to submit at least
    // once — reduces noise while typing. Only `required` is checked on
    // login; anything else (format, strength) is the server's call.
    if (!this.submitAttempted()) return '';
    const control = this.loginForm.get(fieldName);
    if (!control?.errors?.['required']) return '';
    switch (fieldName) {
      case 'organisation':
        return 'Organisation is required';
      case 'username':
        return 'Username is required';
      case 'password':
        return 'Password is required';
      default:
        return 'This field is required';
    }
  }

  // Heuristic: collapse any "username/password" style message into one
  // generic line so we don't leak which half is wrong. Server-sent
  // lockout / downtime / rate-limit messages are passed through unchanged.
  private normaliseAuthError(message?: string): string {
    if (!message) return GENERIC_AUTH_ERROR;
    const lower = message.toLowerCase();
    const leaksField =
      lower.includes('password') ||
      lower.includes('username') ||
      lower.includes('user not') ||
      lower.includes('invalid credentials');
    return leaksField ? GENERIC_AUTH_ERROR : message;
  }
}
