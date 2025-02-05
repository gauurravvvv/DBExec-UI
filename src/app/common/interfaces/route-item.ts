export interface IRouteItem{
    path: string;
    label: string;
    icon: string;
    isActive: boolean;
    items:[],
}
export interface IUserRouteItem{
    label: string;
    icon: string;
    isActive: boolean;
    reportUrl: string;
    status: boolean;
  }