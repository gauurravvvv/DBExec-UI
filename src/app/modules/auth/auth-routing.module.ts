import { Routes } from '@angular/router';
import { authGuard } from 'src/app/core/guards/auth.guard';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { LoginComponent } from './components/login/login.component';
import { RelayComponent } from './components/relay/relay.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { SetPasswordComponent } from './components/set-password/set-password.component';

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
];
