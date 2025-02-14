import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './modules/auth/components/login/login.component';
import { ForgotPasswordComponent } from './modules/auth/components/forgot-password/forgot-password.component';
import { AuthGuard } from './core/guards/auth.guard';
import { HomeComponent } from './modules/layout/home/home.component';
import { ResetPasswordComponent } from './modules/auth/components/reset-password/reset-password.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [AuthGuard],
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
  },
  {
    path: 'app',
    component: HomeComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./modules/dashboard/dashbaord.module').then(
            m => m.DashboardModule
          ),
      },
      {
        path: 'super-admin',
        loadChildren: () =>
          import('./modules/superAdmin/superAdmin.module').then(
            m => m.SuperAdminModule
          ),
      },
      {
        path: 'organisation',
        loadChildren: () =>
          import('./modules/organisation/organisation.module').then(
            m => m.OrganisationModule
          ),
      },
      {
        path: 'org-admin',
        loadChildren: () =>
          import('./modules/organisationAdmin/orgAdmin.module').then(
            m => m.OrgAdminModule
          ),
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./modules/users/users.module').then(m => m.UsersModule),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      scrollPositionRestoration: 'enabled',
      useHash: false,
      preloadingStrategy: PreloadAllModules,
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
