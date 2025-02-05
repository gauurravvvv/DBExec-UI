import { IRole } from './roles';
import { ISite, ISiteListDropdown } from './site';

export interface ClientNameId extends Pick<IClient, 'name' | 'id' | 'sites'> {}
export interface IClient {
  id: string;
  name: string;
  address: string;
  email: string;
  mobile: string;
  contactName: string;
  contactEmail: string;
  contactMobile: string;
  config: IClientConfig;
  zipcode: string;
  country: string;
  status: number;
  clientID: string;
  sites: ISite[];
  adminUsername: string;
  adminPassword: string;
  createdOn: string;
  roles: IRole[];
  rptAdminUsername?: string;
  vslAdminUsername?: string;
}

export interface IClientConfig {
  airflowENV?: string;
  awsAccessKey?: string;
  awsRegion?: string;
  awsSecretKey?: string;
  airflowHost?: string;
  airflowdbport?: number;
  airflowdbname?: number;
  airflowusername?: string;
  airflowPass?: string;
  airflowip?: string;
  airflowport?: number;
  airflowurl: string;
  createdOn: string;
  dwhDBName?: string;
  dwhHost?: string;
  dwhPassword?: string;
  dwhPort?: number;
  dwhType: number;
  dwhUserName?: string;
  id: string;
  medraDBName?: string;
  medraHost?: string;
  medraPass?: string;
  medraPort?: number;
  medraUsername?: string;
  snowflakeAccount?: string;
  snowflakeDatabase?: string;
  snowflakePassword?: string;
  snowflakeRole?: string;
  snowflakeUsername?: string;
  snowflakeWarehouse?: string;
  status: number;
}

export interface IClientListDropdown {
  id: string;
  name: string;
  sites: ISiteListDropdown[];
}
