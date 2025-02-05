import { IRole } from './roles';

export interface IPermissions {
  USER: {
    UI: {
      name: string;
      displayName: string;
      status: boolean;
    }[];
    BI: {
      name: string;
      displayName: string;
      status: boolean;
    }[];
  };
  ADMIN: {
    UI: {
      name: string;
      displayName: string;
      isVisible: boolean;
      status: boolean;
    }[];
    BI: {
      name: string;
      displayName: string;
      isVisible: boolean;
      status: boolean;
    }[];
  };
}

export interface IPermissionsList {
  UI: {
    name: string;
    displayName: string;
    isVisible: boolean;
    status: boolean;
  }[];
  BI: {
    name: string;
    displayName: string;
    isVisible: boolean;
    status: boolean;
  }[];
}

export interface IPermissionDetail {
  prmIndex: number;
  usrIndex: number;
  role: IRole;
}
