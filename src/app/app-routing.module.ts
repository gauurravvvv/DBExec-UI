import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PERMISSIONS } from './core/constants/permissions.constant';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { HomeComponent } from './core/layout/home/home.component';
import { AUTH_ROUTES } from './modules/auth/auth-routing.module';

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
      // System (master-DB) RBAC — platform equivalents of the per-org
      // Roles/Groups/Users. Replaces the retired single system-admin module.
      {
        path: 'system-roles',
        loadChildren: () =>
          import('./modules/system-roles/system-roles.module').then(
            m => m.SystemRoleModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.SYSTEM_ROLE_MANAGEMENT,
          title: 'PAGE_TITLES.SYSTEM_ROLES',
        },
      },
      {
        path: 'system-groups',
        loadChildren: () =>
          import('./modules/system-groups/system-groups.module').then(
            m => m.SystemGroupsModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.SYSTEM_GROUP_MANAGEMENT,
          title: 'PAGE_TITLES.SYSTEM_GROUPS',
        },
      },
      {
        path: 'system-users',
        loadChildren: () =>
          import('./modules/system-users/system-users.module').then(
            m => m.SystemUsersModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.SYSTEM_USER_MANAGEMENT,
          title: 'PAGE_TITLES.SYSTEM_USERS',
        },
      },
      {
        path: 'organisations',
        loadChildren: () =>
          import('./modules/organisation/organisation.module').then(
            m => m.OrganisationModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.ORG_MANAGEMENT,
          title: 'PAGE_TITLES.ORGANISATIONS',
        },
      },
      {
        // User-Management → Activity: the SAME audit list, pre-scoped to the
        // user/group/role modules via route data. Registered BEFORE `users`
        // so the full path wins over UsersModule's `:id` route. Gated on the
        // audit permission — a user without it can't reach the scoped view.
        path: 'users/activity',
        loadChildren: () =>
          import('./modules/audit-logs/audit-logs.module').then(
            m => m.AuditLogsModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.AUDIT_LOGS,
          moduleScope: ['user', 'group', 'role'],
          title: 'PAGE_TITLES.USER_ACTIVITY',
        },
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./modules/users/users.module').then(m => m.UsersModule),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.USER_MANAGEMENT,
          title: 'PAGE_TITLES.USERS',
        },
      },
      {
        path: 'groups',
        loadChildren: () =>
          import('./modules/groups/groups.module').then(m => m.GroupsModule),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.USER_GROUP,
          title: 'PAGE_TITLES.GROUPS',
        },
      },
      {
        path: 'rls-rules',
        loadChildren: () =>
          import('./modules/rls-rules/rls-rules.module').then(
            m => m.RlsRulesModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.RLS_RULES,
          title: 'PAGE_TITLES.RLS_RULES',
        },
      },
      {
        path: 'alerts',
        loadChildren: () =>
          import('./modules/alerts/alerts.module').then(m => m.AlertsModule),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.ALERTS,
          title: 'PAGE_TITLES.ALERTS',
        },
      },
      // Permission-gated
      {
        path: 'datasources',
        loadChildren: () =>
          import('./modules/datasource/datasource.module').then(
            m => m.DatasourceModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.SETUP_DB,
          title: 'PAGE_TITLES.DATASOURCES',
        },
      },
      {
        path: 'db-roles',
        loadChildren: () =>
          import('./modules/db-access/roles/db-roles.module').then(
            m => m.DbRolesModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.DB_ROLES,
          title: 'PAGE_TITLES.DB_ROLES',
        },
      },
      {
        path: 'db-privileges',
        loadChildren: () =>
          import('./modules/db-access/privileges/db-privileges.module').then(
            m => m.DbPrivilegesModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.DB_PRIVILEGES,
          title: 'PAGE_TITLES.DB_PRIVILEGES',
        },
      },
      {
        // Launcher gates on queryRunner; the Connections screens gate on
        // connectionManager — so the parent carries NO single permission.
        // Each child route in QueryRunnerModule guards itself via roleGuard
        // + its own data.permission. (Still auth-gated by the /app shell.)
        path: 'query-runner',
        loadChildren: () =>
          import('./modules/query-runner/query-runner.module').then(
            m => m.QueryRunnerModule,
          ),
        data: {
          title: 'PAGE_TITLES.QUERY_RUNNER',
        },
      },
      {
        path: 'roles',
        loadChildren: () =>
          import('./modules/role/role.module').then(m => m.RoleModule),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.ROLE_MANAGEMENT,
          title: 'PAGE_TITLES.ROLES',
        },
      },
      {
        path: 'datasets',
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
        data: {
          permission: PERMISSIONS.ANALYSES,
          title: 'PAGE_TITLES.ANALYSES',
        },
      },
      {
        path: 'dashboards',
        loadChildren: () =>
          import('./modules/dashboard/dashboard.module').then(
            m => m.DashboardModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.DASHBOARD,
          title: 'PAGE_TITLES.DASHBOARDS',
        },
      },
      {
        path: 'prompts',
        loadChildren: () =>
          import('./modules/prompt/prompt.module').then(m => m.PromptModule),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.QB_PROMPT,
          title: 'PAGE_TITLES.PROMPTS',
        },
      },
      {
        path: 'query-builders',
        loadChildren: () =>
          import('./modules/query-builder/query-builder.module').then(
            m => m.QueryBuilderModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.QB_SCREEN,
          title: 'PAGE_TITLES.QUERY_BUILDERS',
        },
      },
      {
        path: 'audit',
        loadChildren: () =>
          import('./modules/audit-logs/audit-logs.module').then(
            m => m.AuditLogsModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.AUDIT_LOGS,
          title: 'PAGE_TITLES.AUDIT_LOGS',
        },
      },
      {
        path: 'audit/logins',
        loadChildren: () =>
          import('./modules/login-activity/login-activity.module').then(
            m => m.LoginActivityModule,
          ),
        canActivate: [roleGuard],
        data: {
          permission: PERMISSIONS.LOGIN_ACTIVITY,
          title: 'PAGE_TITLES.LOGIN_ACTIVITY',
        },
      },
      {
        // Settings hosts TWO hubs (App / System) gated on DIFFERENT
        // permissions, so the per-hub gate lives on the child routes inside
        // the module (see app-settings-routing.module.ts). The parent only
        // enforces "logged in" via roleGuard (no permission → login check only).
        path: 'settings',
        loadChildren: () =>
          import('./modules/app-settings/app-settings.module').then(
            m => m.AppSettingsModule,
          ),
        canActivate: [roleGuard],
        data: {
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
      // Per-user notifications feed — auth-gated only (no permission),
      // reachable from the bell panel's "See all". System Admin has no
      // org binding, so the component guards its own visibility, but the
      // route itself stays open to every authenticated user.
      {
        path: 'notifications',
        loadChildren: () =>
          import('./modules/notifications/notifications.module').then(
            m => m.NotificationsModule,
          ),
        data: { title: 'PAGE_TITLES.NOTIFICATIONS' },
      },
      {
        path: 'not-found',
        loadComponent: () =>
          import('./shared/components/not-found/not-found.component').then(
            m => m.NotFoundComponent,
          ),
        data: { title: 'PAGE_TITLES.NOT_FOUND' },
      },
    ],
  },
  // Standalone Query Runner executor — deliberately OUTSIDE the `app`
  // shell (no sidebar/topbar) so a browser tab opened from the launcher
  // is a focused, full-screen workspace. Still auth + permission gated.
  {
    path: 'query-runner/exec',
    loadChildren: () =>
      import('./modules/query-runner/executor/query-executor.module').then(
        m => m.QueryExecutorModule,
      ),
    canActivate: [authGuard, roleGuard],
    data: {
      permission: PERMISSIONS.QUERY_RUNNER,
      title: 'PAGE_TITLES.QUERY_RUNNER',
    },
  },
  // Public dashboard embed — UNAUTHENTICATED, token-guarded, OUTSIDE the
  // `app` shell (no sidebar/topbar, no auth/role guard). The BE mints links
  // as /embed/dashboard/:token; the viewer resolves everything from the
  // opaque token via the public render/run endpoints. Deliberately carries
  // no guards so an anonymous viewer (or an <iframe>) can open it.
  {
    path: 'embed/dashboard/:token',
    loadChildren: () =>
      import('./modules/embed/embed-dashboard.module').then(
        m => m.EmbedDashboardModule,
      ),
    data: { title: 'PAGE_TITLES.EMBED_DASHBOARD' },
  },
  // Anything unknown lands on a real 404 page rather than silently
  // bouncing to /login. Inside the authenticated shell so the user
  // keeps the sidebar/topbar and can navigate away cleanly.
  {
    path: '**',
    redirectTo: 'app/not-found',
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
