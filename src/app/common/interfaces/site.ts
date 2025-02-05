export interface ISite {
  adminUsername: any;
  adminPassword: any;
  password: any;
  id: string;
  name: string;
  ip: string;
  status: number;
  url: string;
  port: number;
  type: number;
  username: string;
  clients: Client[];
  createdOn: string;
  accountId?: string;
  region?: string;
  justification?: string;
}

export interface ISiteListDropdown {
  id: string;
  name: string;
  status?: number;
  type?: number;
}
export interface Client {
  id: string;
  name: string;
}
