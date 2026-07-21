import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoginService } from 'src/app/core/services/login.service';

/**
 * SsoRelayComponent — mounted at /auth/sso-relay (PUBLIC, no guard).
 *
 * Landing page for the SAML callback. The BE's /auth/saml/callback 302s
 * the browser here with `SAMLResponse` + `RelayState` in the URL. This
 * component reads them, POSTs to /auth/saml/login, and then navigates
 * into the app via the SAME /relay screen the password flow uses — so
 * the phase-2 /auth/session bootstrap (permissions / theme / branding /
 * locale) runs through the existing, unchanged path.
 *
 *   loading — verifying the SSO response with the BE.
 *   error   — no payload in the URL, or the BE rejected the assertion.
 *             Shows a friendly message + a Back-to-login button.
 */
@Component({
  selector: 'app-sso-relay',
  templateUrl: './sso-relay.component.html',
  styleUrls: ['./sso-relay.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SsoRelayComponent implements OnInit {
  readonly state = signal<'loading' | 'error'>('loading');
  readonly errorMessage = signal('');

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private loginService = inject(LoginService);

  ngOnInit(): void {
    const SAMLResponse = this.route.snapshot.queryParamMap.get('SAMLResponse');
    const account = this.route.snapshot.queryParamMap.get('RelayState');

    if (!SAMLResponse || !account) {
      this.fail('AUTH.SSO.NO_RESPONSE');
      return;
    }

    this.loginService.completeSamlLogin(account, SAMLResponse).then(
      res => {
        if (res?.status === true && res?.code === 200) {
          // Hand off to the shared relay screen — it fires phase-2
          // (/auth/session) and lands on the role's home route.
          this.router.navigateByUrl('/relay', { replaceUrl: true });
          return;
        }
        // BE rejected the assertion — surface the generic SSO failure.
        this.fail('AUTH.SSO.FAILED');
      },
      () => this.fail('AUTH.SSO.FAILED'),
    );
  }

  backToLogin(): void {
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /** `message` is an i18n key resolved by the template's translate pipe. */
  private fail(messageKey: string): void {
    this.state.set('error');
    this.errorMessage.set(messageKey);
  }
}
