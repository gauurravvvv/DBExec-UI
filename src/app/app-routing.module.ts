import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './modules/auth/components/login/login.component';
import { ForgotPasswordComponent } from './modules/auth/components/forgot-password/forgot-password.component';
import { AuthGuard } from './core/guards/auth.guard';
import { HomeComponent } from './shared/components/layout/home/home.component';
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
          import('./modules/dashboard/dashboard.module').then(
            m => m.DashboardModule
          ),
      },
      {
        path: 'super-admin',
        loadChildren: () =>
          import('./modules/superAdmin/super-admin.module').then(
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
          import('./modules/organisation-admin/organisation-admin.module').then(
            m => m.OrgAdminModule
          ),
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./modules/users/users.module').then(m => m.UsersModule),
      },
      {
        path: 'group',
        loadChildren: () =>
          import('./modules/groups/group.module').then(m => m.GroupModule),
      },
      {
        path: 'access',
        loadChildren: () =>
          import('./modules/access/access.module').then(m => m.AccessModule),
      },
      {
        path: 'environment',
        loadChildren: () =>
          import('./modules/environment/environment.module').then(
            m => m.EnvironmentModule
          ),
      },
      {
        path: 'category',
        loadChildren: () =>
          import('./modules/categories/category.module').then(
            m => m.CategoryModule
          ),
      },
      {
        path: 'database',
        loadChildren: () =>
          import('./modules/database/database.module').then(
            m => m.DatabaseModule
          ),
      },

      {
        path: 'role',
        loadChildren: () =>
          import('./modules/role/role.module').then(m => m.RoleModule),
      },
      {
        path: 'secrets',
        loadChildren: () =>
          import('./modules/credentials/credentials.module').then(
            m => m.CredentialsModule
          ),
      },
      {
        path: 'dataset',
        loadChildren: () =>
          import('./modules/dataset/dataset.module').then(m => m.DatasetModule),
      },
      {
        path: 'tab',
        loadChildren: () =>
          import('./modules/tab/tab.module').then(m => m.TabModule),
      },
      {
        path: 'section',
        loadChildren: () =>
          import('./modules/section/section.module').then(m => m.SectionModule),
      },
      {
        path: 'prompt',
        loadChildren: () =>
          import('./modules/prompt/prompt.module').then(m => m.PromptModule),
      },
      {
        path: 'screen',
        loadChildren: () =>
          import('./modules/screen/screen.module').then(m => m.ScreenModule),
      },
      {
        path: 'query',
        loadChildren: () =>
          import('./modules/query/query.module').then(m => m.QueryModule),
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
