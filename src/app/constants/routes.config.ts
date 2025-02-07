// import { ListSuperAdminComponent } from "../components/super-admin/list-super-admin/list-super-admin.component";
// import { ProfileComponent } from "../components/profile/profile.component";

interface RouteConfig {
  path: string;
  component: any;
  children?: RouteConfig[];
}

interface MenuItem {
  label: string;
  route?: string;
  icon: string;
  children?: MenuItem[];
}

// Route configurations mapping permissions to components
export const ROUTE_CONFIGS: { [key: string]: RouteConfig } = {
  // superAdminDashboard: {
  //   path: "dashboard",
  //   component: ListSuperAdminComponent,
  // },
  // systemManagement: {
  //   path: "system",
  //   component: ListSuperAdminComponent,
  //   children: [
  //     {
  //       path: "super-admin",
  //       component: ListSuperAdminComponent,
  //     },
  //     {
  //       path: "organizations",
  //       component: ListSuperAdminComponent,
  //     },
  //     {
  //       path: "org-admin",
  //       component: ListSuperAdminComponent,
  //     },
  //     {
  //       path: "users",
  //       component: ListSuperAdminComponent,
  //     },
  //   ],
  // },
  // databaseManagement: {
  //   path: "database",
  //   component: ListSuperAdminComponent,
  //   children: [
  //     {
  //       path: "setup",
  //       component: ListSuperAdminComponent,
  //     },
  //     {
  //       path: "configure",
  //       component: ListSuperAdminComponent,
  //       children: [
  //         {
  //           path: "schema",
  //           component: ListSuperAdminComponent,
  //         },
  //         {
  //           path: "role",
  //           component: ListSuperAdminComponent,
  //         },
  //         {
  //           path: "table",
  //           component: ListSuperAdminComponent,
  //         },
  //       ],
  //     },
  //   ],
  // },
  // qExecutor: {
  //   path: "query-executor",
  //   component: ListSuperAdminComponent,
  // },
  // myProfile: {
  //   path: "profile",
  //   component: ProfileComponent,
  // },
};

// Menu items configuration for sidebar
export const MENU_ITEMS: MenuItem[] = [
  {
    label: 'Dashboard',
    route: '/home/dashboard',
    icon: 'fas fa-house',
  },
  {
    label: 'System Management',
    icon: 'fas fa-users-cog',
    children: [
      {
        label: 'Super Admin',
        route: '/home/system/super-admin',
        icon: 'fas fa-user-gear',
      },
      {
        label: 'Organisations',
        route: '/home/system/organizations',
        icon: 'fas fa-building',
      },
      {
        label: 'Organisation Admin',
        route: '/home/system/org-admin',
        icon: 'fas fa-user-tie',
      },
      {
        label: 'Users',
        route: '/home/system/users',
        icon: 'fas fa-users',
      },
    ],
  },
  {
    label: 'Database Management',
    icon: 'fas fa-database',
    children: [
      {
        label: 'Setup DB',
        route: '/home/database/setup',
        icon: 'fas fa-wrench',
      },
      {
        label: 'Configure DB',
        icon: 'fas fa-sliders',
        children: [
          {
            label: 'Schema',
            route: '/home/database/configure/schema',
            icon: 'fas fa-file-lines',
          },
          {
            label: 'Role',
            route: '/home/database/configure/role',
            icon: 'fas fa-shield-halved',
          },
          {
            label: 'Table',
            route: '/home/database/configure/table',
            icon: 'fas fa-table-cells',
          },
        ],
      },
    ],
  },
  {
    label: 'Query Executer',
    route: '/home/query-executor',
    icon: 'fas fa-bolt',
  },
  {
    label: 'My Profile',
    route: '/home/profile',
    icon: 'fas fa-user',
  },
];
