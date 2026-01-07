import { IEnvironment } from 'src/app/types/environment.types';

export const environment: IEnvironment = {
  production: true,
  apiServer: 'http://localhost:3000/api/v1',
  queryServer: 'http://localhost:3001/api/v1',
  appURL: 'http://localhost:4200',
  appVersion: 'v26.1',
};
