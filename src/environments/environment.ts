import { IEnvironment } from 'src/app/core/models/environment.model';

export const environment: IEnvironment = {
  production: false,
  apiServer: 'http://localhost:3000/api/v1',
  appURL: 'http://localhost:4200',
  appVersion: 'v26.1',
};
