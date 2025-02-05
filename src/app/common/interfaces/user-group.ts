export interface IUserGroupViewDetails {
  id: string;
  name: string;
  description: string;
  status: number;
  client: string;
  userCount: number;
}

export interface IUserDetails {
  id: string;
  name: string;
  lastLogin: string;
  status: number;
  email: string;
  username: string;
}
