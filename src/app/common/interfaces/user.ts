import { IClient } from './client';
import { IEnterprise } from './enterprises';
import { IPermissions } from './permissions';
import { IRole } from './roles';
import { ISite } from './site';

export interface IUser {
  authToken: string;
  createdOn: string;
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  lastLogin: string;
  status: number;
  mobile: string;
  username: string;
  roles: IRole[];
  enterprises: IEnterprise[];
  isFirstLogin: boolean;
  token: string;
  tokenExpiration: number;
}
export interface IUserGroup {
  id: string;
  name: string;
}
