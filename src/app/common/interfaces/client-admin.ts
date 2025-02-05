import { IRole } from "./roles";

export interface IAdmin {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    updatedOn: string;
    lastLogin: number;
    status: number;
    username: string;
    password: string;
    clients: {name:string}[];
    roles: IRole[];
  }