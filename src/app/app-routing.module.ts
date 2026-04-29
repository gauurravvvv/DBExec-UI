import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PERMISSIONS } from './constants/permissions.constant';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { AUTH_ROUTES } from './modules/auth/auth-routing.module';
import { HomeComponent } from './shared/components/layout/home/home.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  ...AUTH_ROUTES,
  {
    path: 'app',
    component: HomeComponent,
    canActivate: [authGuard],
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
        path: 'system-admin',
        loadChildren: () =>
          import('./modules/system-admin/system-admin.module').then(
            m => m.SystemAdminModule,
          ),
        canActivate: [roleGuard],
        data: { roles: ['SYSTEM-ADMIN'], title: 'System Admins' },
      },
      {
        path: 'organisation',
        loadChildren: () =>
          import('./modules/organisation/organisation.module').then(
            m => m.OrganisationModule,
          ),
        canActivate: [roleGuard],
        data: { roles: ['SYSTEM-ADMIN'], title: 'Organisations' },
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./modules/users/users.module').then(m => m.UsersModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.USER_MANAGEMENT, title: 'Users' },
      },
      {
        path: 'group',
        loadChildren: () =>
          import('./modules/groups/group.module').then(m => m.GroupModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.USER_GROUP, title: 'Groups' },
      },
      {
        path: 'rls-rules',
        loadChildren: () =>
          import('./modules/rls-rules/rls-rules.module').then(
            m => m.RlsRulesModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.RLS_RULES, title: 'RLS Rules' },
      },
      {
        path: 'access',
        loadChildren: () =>
          import('./modules/access/access.module').then(m => m.AccessModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.ACCESS_MANAGEMENT, title: 'Access' },
      },
      // Permission-gated
      {
        path: 'datasource',
        loadChildren: () =>
          import('./modules/datasource/datasource.module').then(
            m => m.DatasourceModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.SETUP_DB, title: 'Datasources' },
      },
      {
        path: 'connections',
        loadChildren: () =>
          import('./modules/connection/connection.module').then(
            m => m.ConnectionsModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.DB_CONNECTIONS, title: 'Connections' },
      },
      {
        path: 'role',
        loadChildren: () =>
          import('./modules/role/role.module').then(m => m.RoleModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.ROLE_MANAGEMENT, title: 'Roles' },
      },
      {
        path: 'dataset',
        loadChildren: () =>
          import('./modules/dataset/dataset.module').then(m => m.DatasetModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.DATASET, title: 'Dataset' },
      },
      {
        path: 'analyses',
        loadChildren: () =>
          import('./modules/analyses/analyses.module').then(
            m => m.AnalysesModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.ANALYSES, title: 'Analyses' },
      },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./modules/dashboard/dashboard.module').then(
            m => m.DashboardModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.DASHBOARD, title: 'Dashboards' },
      },
      {
        path: 'tab',
        loadChildren: () =>
          import('./modules/tab/tab.module').then(m => m.TabModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.QB_TAB, title: 'Tabs' },
      },
      {
        path: 'section',
        loadChildren: () =>
          import('./modules/section/section.module').then(m => m.SectionModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.QB_SECTION, title: 'Sections' },
      },
      {
        path: 'prompt',
        loadChildren: () =>
          import('./modules/prompt/prompt.module').then(m => m.PromptModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.QB_PROMPT, title: 'Prompts' },
      },
      {
        path: 'query-builder',
        loadChildren: () =>
          import('./modules/query-builder/query-builder.module').then(
            m => m.QueryBuilderModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.QB_SCREEN, title: 'Query Builders' },
      },
      {
        path: 'audit-logs',
        loadChildren: () =>
          import('./modules/audit/audit.module').then(m => m.AuditModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.AUDIT_LOGS, title: 'Audit Logs' },
      },
      {
        path: 'login-activity',
        loadChildren: () =>
          import('./modules/audit/login-activity.module').then(
            m => m.LoginActivityModule,
          ),
        canActivate: [roleGuard],
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
        canActivate: [roleGuard],
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
