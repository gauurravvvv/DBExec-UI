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
        data: { title: 'PAGE_TITLES.HOME' },
      },
      {
        path: 'system-admin',
        loadChildren: () =>
          import('./modules/system-admin/system-admin.module').then(
            m => m.SystemAdminModule,
          ),
        canActivate: [roleGuard],
        data: { roles: ['SYSTEM-ADMIN'], title: 'PAGE_TITLES.SYSTEM_ADMINS' },
      },
      {
        path: 'organisation',
        loadChildren: () =>
          import('./modules/organisation/organisation.module').then(
            m => m.OrganisationModule,
          ),
        canActivate: [roleGuard],
        data: { roles: ['SYSTEM-ADMIN'], title: 'PAGE_TITLES.ORGANISATIONS' },
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./modules/users/users.module').then(m => m.UsersModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.USER_MANAGEMENT, title: 'PAGE_TITLES.USERS' },
      },
      {
        path: 'group',
        loadChildren: () =>
          import('./modules/groups/group.module').then(m => m.GroupModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.USER_GROUP, title: 'PAGE_TITLES.GROUPS' },
      },
      {
        path: 'rls-rules',
        loadChildren: () =>
          import('./modules/rls-rules/rls-rules.module').then(
            m => m.RlsRulesModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.RLS_RULES, title: 'PAGE_TITLES.RLS_RULES' },
      },
      {
        path: 'access',
        loadChildren: () =>
          import('./modules/access/access.module').then(m => m.AccessModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.ACCESS_MANAGEMENT, title: 'PAGE_TITLES.ACCESS' },
      },
      // Permission-gated
      {
        path: 'datasource',
        loadChildren: () =>
          import('./modules/datasource/datasource.module').then(
            m => m.DatasourceModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.SETUP_DB, title: 'PAGE_TITLES.DATASOURCES' },
      },
      {
        path: 'connections',
        loadChildren: () =>
          import('./modules/connection/connection.module').then(
            m => m.ConnectionsModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.DB_CONNECTIONS, title: 'PAGE_TITLES.CONNECTIONS' },
      },
      {
        path: 'role',
        loadChildren: () =>
          import('./modules/role/role.module').then(m => m.RoleModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.ROLE_MANAGEMENT, title: 'PAGE_TITLES.ROLES' },
      },
      {
        path: 'dataset',
        loadChildren: () =>
          import('./modules/dataset/dataset.module').then(m => m.DatasetModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.DATASET, title: 'PAGE_TITLES.DATASET' },
      },
      {
        path: 'analyses',
        loadChildren: () =>
          import('./modules/analyses/analyses.module').then(
            m => m.AnalysesModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.ANALYSES, title: 'PAGE_TITLES.ANALYSES' },
      },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./modules/dashboard/dashboard.module').then(
            m => m.DashboardModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.DASHBOARD, title: 'PAGE_TITLES.DASHBOARDS' },
      },
      {
        path: 'tab',
        loadChildren: () =>
          import('./modules/tab/tab.module').then(m => m.TabModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.QB_TAB, title: 'PAGE_TITLES.TABS' },
      },
      {
        path: 'section',
        loadChildren: () =>
          import('./modules/section/section.module').then(m => m.SectionModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.QB_SECTION, title: 'PAGE_TITLES.SECTIONS' },
      },
      {
        path: 'prompt',
        loadChildren: () =>
          import('./modules/prompt/prompt.module').then(m => m.PromptModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.QB_PROMPT, title: 'PAGE_TITLES.PROMPTS' },
      },
      {
        path: 'query-builder',
        loadChildren: () =>
          import('./modules/query-builder/query-builder.module').then(
            m => m.QueryBuilderModule,
          ),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.QB_SCREEN, title: 'PAGE_TITLES.QUERY_BUILDERS' },
      },
      {
        path: 'audit-logs',
        loadChildren: () =>
          import('./modules/audit/audit.module').then(m => m.AuditModule),
        canActivate: [roleGuard],
        data: { permission: PERMISSIONS.AUDIT_LOGS, title: 'PAGE_TITLES.AUDIT_LOGS' },
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
          title: 'PAGE_TITLES.LOGIN_ACTIVITY',
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
          title: 'PAGE_TITLES.APP_SETTINGS',
        },
      },
      // All roles
      {
        path: 'profile',
        loadChildren: () =>
          import('./modules/profile/profile.module').then(m => m.ProfileModule),
        data: { title: 'PAGE_TITLES.MY_PROFILE' },
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
