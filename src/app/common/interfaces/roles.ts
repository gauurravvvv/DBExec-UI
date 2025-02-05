import { IClient } from './client';
import { IFolders } from './folders';
import { IPermissionsList } from './permissions';
import { ISite } from './site';

export interface IRole {
  id: string;
  name: string;
  permission: IPermissionsList;
  isDefault: boolean;
  accountName: string;
  adminUsername: string;
  adminPassword: string;
  status: number;
  createdOn: string;
  folders: IFolders[];
  site: ISite;
  client: IClient;
}

export interface IRolesListDropdown {
  id: string;
  name: string;
  type?: number;
  vsl_id?: string;
}
