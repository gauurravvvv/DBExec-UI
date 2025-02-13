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
