import { Routes } from '@angular/router';
import { authGuard } from 'src/app/core/guards/auth.guard';
import { CliAuthComponent } from './components/cli-auth/cli-auth.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { LoginComponent } from './components/login/login.component';
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
    path: 'cli-auth',
    component: CliAuthComponent,
    data: { title: 'PAGE_TITLES.CLI_AUTH' },
  },
];
