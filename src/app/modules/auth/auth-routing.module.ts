import { Routes } from '@angular/router';
import { AuthGuard } from 'src/app/core/guards/auth.guard';
import { CliAuthComponent } from './components/cli-auth/cli-auth.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { LoginComponent } from './components/login/login.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { SetPasswordComponent } from './components/set-password/set-password.component';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [AuthGuard],
    data: { title: 'Login' },
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
    canActivate: [AuthGuard],
    data: { title: 'Forgot Password' },
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
    canActivate: [AuthGuard],
    data: { title: 'Reset Password' },
  },
  {
    path: 'set-password',
    component: SetPasswordComponent,
    data: { title: 'Set Password' },
  },
  {
    path: 'cli-auth',
    component: CliAuthComponent,
    data: { title: 'CLI Authentication' },
  },
];
