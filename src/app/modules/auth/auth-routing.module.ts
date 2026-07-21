import { Routes } from '@angular/router';
import { authGuard } from 'src/app/core/guards/auth.guard';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { LoginComponent } from './components/login/login.component';
import { RelayComponent } from './components/relay/relay.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { SetPasswordComponent } from './components/set-password/set-password.component';
import { SsoRelayComponent } from './components/sso-relay/sso-relay.component';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [authGuard],
    data: { title: 'PAGE_TITLES.LOGIN' },
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
    canActivate: [authGuard],
    data: { title: 'PAGE_TITLES.FORGOT_PASSWORD' },
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
    canActivate: [authGuard],
    data: { title: 'PAGE_TITLES.RESET_PASSWORD' },
  },
  {
    path: 'set-password',
    component: SetPasswordComponent,
    data: { title: 'PAGE_TITLES.SET_PASSWORD' },
  },
  {
    // Post-login transition surface. Routes here only after a
    // successful phase-1 login — direct visits without relay state
    // bounce back to /login via the component's ngOnInit.
    // canActivate keeps the standard logged-in check (handled by
    // authGuard's POST_LOGIN_ROUTES carve-out).
    path: 'relay',
    component: RelayComponent,
    canActivate: [authGuard],
    data: { title: 'PAGE_TITLES.RELAY' },
  },
  {
    // SAML SSO landing surface. PUBLIC — no guard: the browser arrives
    // here via the BE 302 mid-authentication with no app token yet, so
    // authGuard (which redirects the unauthenticated to /login) would
    // break the flow. The component reads SAMLResponse + RelayState from
    // the query string, POSTs them to /auth/saml/login, then hands off
    // to /relay for the standard phase-2 bootstrap. The BE callback
    // redirects to `${FE_URL}/auth/sso-relay`, so the path is nested
    // under `auth/` to match.
    path: 'auth/sso-relay',
    component: SsoRelayComponent,
    data: { title: 'PAGE_TITLES.LOGIN' },
  },
];
