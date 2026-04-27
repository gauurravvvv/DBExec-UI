import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './modules/auth/components/login/login.component';
import { ForgotPasswordComponent } from './modules/auth/components/forgot-password/forgot-password.component';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';
import { HomeComponent } from './shared/components/layout/home/home.component';
import { ResetPasswordComponent } from './modules/auth/components/reset-password/reset-password.component';
import { SetPasswordComponent } from './modules/auth/components/set-password/set-password.component';
import { CliAuthComponent } from './modules/auth/components/cli-auth/cli-auth.component';
import { PERMISSIONS } from './constants/permissions.constant';

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
  {
    path: 'app',
    component: HomeComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
      {
        path: 'home',
        loadChildren: () =>
          import('./modules/home/home.module').then(m => m.HomeModule),
        data: { title: 'Home' },
      },
      {
        path: 'super-admin',
        loadChildren: () =>
          import('./modules/superAdmin/super-admin.module').then(
            m => m.SuperAdminModule,
          ),
        canActivate: [RoleGuard],
        data: { roles: ['SUPER-ADMIN'], title: 'Super Admins' },
      },
      {
        path: 'organisation',
        loadChildren: () =>
          import('./modules/organisation/organisation.module').then(
            m => m.OrganisationModule,
          ),
        canActivate: [RoleGuard],
        data: { roles: ['SUPER-ADMIN'], title: 'Organisations' },
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./modules/users/users.module').then(m => m.UsersModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.USER_MANAGEMENT, title: 'Users' },
      },
      {
        path: 'group',
        loadChildren: () =>
          import('./modules/groups/group.module').then(m => m.GroupModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.USER_GROUP, title: 'Groups' },
      },
      {
        path: 'rls-rules',
        loadChildren: () =>
          import('./modules/rls-rules/rls-rules.module').then(
            m => m.RlsRulesModule,
          ),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.RLS_RULES, title: 'RLS Rules' },
      },
      {
        path: 'access',
        loadChildren: () =>
          import('./modules/access/access.module').then(m => m.AccessModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.ACCESS_MANAGEMENT, title: 'Access' },
      },
      // Permission-gated
      {
        path: 'datasource',
        loadChildren: () =>
          import('./modules/datasource/datasource.module').then(
            m => m.DatasourceModule,
          ),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.SETUP_DB, title: 'Datasources' },
      },
      {
        path: 'connections',
        loadChildren: () =>
          import('./modules/connection/connection.module').then(
            m => m.ConnectionsModule,
          ),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.DB_CONNECTIONS, title: 'Connections' },
      },
      {
        path: 'role',
        loadChildren: () =>
          import('./modules/role/role.module').then(m => m.RoleModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.ROLE_MANAGEMENT, title: 'Roles' },
      },
      {
        path: 'dataset',
        loadChildren: () =>
          import('./modules/dataset/dataset.module').then(m => m.DatasetModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.DATASET, title: 'Dataset' },
      },
      {
        path: 'analyses',
        loadChildren: () =>
          import('./modules/analyses/analyses.module').then(
            m => m.AnalysesModule,
          ),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.ANALYSES, title: 'Analyses' },
      },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./modules/dashboard/dashboard.module').then(
            m => m.DashboardModule,
          ),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.DASHBOARD, title: 'Dashboards' },
      },
      {
        path: 'tab',
        loadChildren: () =>
          import('./modules/tab/tab.module').then(m => m.TabModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.QB_TAB, title: 'Tabs' },
      },
      {
        path: 'section',
        loadChildren: () =>
          import('./modules/section/section.module').then(m => m.SectionModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.QB_SECTION, title: 'Sections' },
      },
      {
        path: 'prompt',
        loadChildren: () =>
          import('./modules/prompt/prompt.module').then(m => m.PromptModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.QB_PROMPT, title: 'Prompts' },
      },
      {
        path: 'query-builder',
        loadChildren: () =>
          import('./modules/query-builder/query-builder.module').then(
            m => m.QueryBuilderModule,
          ),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.QB_SCREEN, title: 'Query Builders' },
      },
      {
        path: 'audit-logs',
        loadChildren: () =>
          import('./modules/audit/audit.module').then(m => m.AuditModule),
        canActivate: [RoleGuard],
        data: { permission: PERMISSIONS.AUDIT_LOGS, title: 'Audit Logs' },
      },
      {
        path: 'login-activity',
        loadChildren: () =>
          import('./modules/audit/login-activity.module').then(
            m => m.LoginActivityModule,
          ),
        canActivate: [RoleGuard],
        data: {
          permission: PERMISSIONS.LOGIN_ACTIVITY,
          title: 'Login Activity',
        },
      },
      {
        path: 'app-settings',
        loadChildren: () =>
          import('./modules/app-settings/app-settings.module').then(
            m => m.AppSettingsModule,
          ),
        canActivate: [RoleGuard],
        data: {
          permission: PERMISSIONS.ANNOUNCEMENT_MANAGEMENT,
          title: 'App Settings',
        },
      },
      // All roles
      {
        path: 'profile',
        loadChildren: () =>
          import('./modules/profile/profile.module').then(m => m.ProfileModule),
        data: { title: 'My Profile' },
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
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
