export interface IFolders {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface IFoldersList {
  id: string;
  createdOn: string;
  status: number;
  name: string;
}

export interface ClientList {
  id: string;
  name: string;
  sites: Site[];
}

export interface ClientListDropdown {
  id: string;
  name: string;
}
export interface Site {
  id: string;
  name: string;
  type: number;
}
