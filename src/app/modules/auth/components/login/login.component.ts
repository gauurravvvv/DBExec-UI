import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  signal,
} from '@angular/core';
import { FormGroup, UntypedFormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from 'src/app/core/services/global.service';
import { LoginService } from 'src/app/core/services/login.service';
import {
  loginPasswordSchema,
  organisationSchema,
  usernameSchema,
} from 'src/app/shared/validators/auth';
import { zodValidator } from 'src/app/shared/validators/zod-validator';

// Single generic message for any "wrong identifier or credential" outcome.
// Specific server-side reasons (lockout, downtime, etc.) still pass through.
const GENERIC_AUTH_ERROR = 'The credentials you entered are incorrect.';

// HTTP status the BE returns for a user whose password was never set
// (account created but the set-password link hasn't been used yet). Its
// message is safe + actionable, so we surface it verbatim instead of
// collapsing it into the generic credentials error.
const PASSWORD_NOT_SET_CODE = 403;

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
    // Field validators sourced from the SHARED Zod schema at
    // src/app/shared/validators/auth.ts (mirrored to BE). Login keeps
    // looser rules than user-creation: required-only on username, no
    // strength check on the password we're about to send to the
    // server. Format / strength checks at sign-in would block legacy
    // accounts and leak the current policy to attackers.
    this.loginForm = this.fb.group({
      organisation: ['', [zodValidator(organisationSchema)]],
      username: ['', [zodValidator(usernameSchema)]],
      password: ['', [zodValidator(loginPasswordSchema)]],
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
        // Phase-1 success — hand off to the relay screen. The relay
        // component fires phase 2 (GET /auth/session) and then
        // navigates to the role's home route once the heavy session
        // payload is ready. `returnUrl` is preserved by stashing it
        // and read back after the bootstrap finishes — for now we
        // simply route through the relay and land on the home route
        // (deep-link preservation is a follow-up if needed).
        this.router.navigateByUrl('/relay', { replaceUrl: true });
      } else {
        this.loginError.set(this.resolveAuthError(res?.code, res?.message));
      }
    } catch (err: any) {
      // An HttpErrorResponse carries the API envelope on `err.error`
      // ({ status, code, message }); the top-level `err.message` is the
      // raw HTTP status text, not our message. Read the envelope first.
      const code = err?.error?.code ?? err?.status;
      const message = err?.error?.message ?? err?.message;
      this.loginError.set(this.resolveAuthError(code, message));
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

  // Decide what to show for a failed login. The password-not-set case is a
  // 403 from the BE with a helpful, already-localised message ("Your account
  // has not been activated yet. Please check your email for the setup link…").
  // That is NOT a leak (the account exists but was never activated — the user
  // must act), so it is surfaced verbatim. Every other failure goes through
  // the anti-enumeration normaliser below.
  private resolveAuthError(code?: number, message?: string): string {
    if (code === PASSWORD_NOT_SET_CODE && message) {
      return message;
    }
    return this.normaliseAuthError(message) || GENERIC_AUTH_ERROR;
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
