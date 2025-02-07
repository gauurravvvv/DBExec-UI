import { UserRole } from "../constants/auth.constants";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  token: string;
  organization?: string;
}

export interface LoginCredentials {
  organization: string;
  username: string;
  password: string;
}
