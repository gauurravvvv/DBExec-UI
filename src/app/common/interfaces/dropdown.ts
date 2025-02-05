export interface IEnterpriseListDropdown {
  enterpriseID: number;
  enterpriseName: string;
}

export interface IClientListDropdown {
  name: string;
  id: string;
  sites: any;
  status: number;
}

export interface ISiteListDropdown {
  name: string;
  id: string;
  status: number;
}

export interface IRolesListDropdown {
  name: string;
  id: string;
  status: number;
}
