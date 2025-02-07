import { MENU_ITEMS } from "src/app/constants/routes.config";

export const SIDEBAR_ITEMS_ROUTES = [
  {
    value: "dashboard",
    route: "/home/dashboard",
  },
  {
    value: "superAdmin",
    route: "/home/system/super-admin",
  },
  {
    value: "orgManagement",
    route: "/home/system/organizations",
  },
  {
    value: "orgAdmin",
    route: "/home/system/org-admin",
  },
  {
    value: "userManagement",
    route: "/home/system/users",
  },
  {
    value: "userMapper",
    route: "/home/system/users",
  },
  {
    value: "setupDB",
    route: "/home/database/setup",
  },
  {
    value: "dbSchema",
    route: "/home/system/configureDB",
  },
  {
    value: "dbRole",
    route: "/home/system/dbRole",
  },
  {
    value: "dbTable",
    route: "/home/system/dbTable",
  },
  {
    value: "qExecutor",
    route: "/home/system/qExecutor",
  },
  {
    value: "secretsEnvironment",
    route: "/home/secrets/environments",
  },
  {
    value: "secretsCredentials",
    route: "/home/system/secretsCreds",
  },
  {
    value: "secretsCategory",
    route: "/home/secrets/categories",
  },
  {
    value: "myProfile",
    route: "/home/system/myProfile",
  },
];

MENU_ITEMS;
