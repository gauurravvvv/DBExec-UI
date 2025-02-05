import { IRole } from './roles';
export interface IDecodeToken {
  id: string;
  name: string;
  email: string;
  isFirstLogin: boolean;
  role: IRole[];
  exp: number;
  iat: number;
  clientId: string;
  roleName: string;
}
