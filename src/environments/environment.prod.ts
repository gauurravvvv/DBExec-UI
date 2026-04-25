import { IEnvironment } from 'src/app/types/environment.types';

export const environment: IEnvironment = {
  production: true,
  apiServer: '__API_SERVER__',  // Replace at deploy time (e.g., https://api.dbexec.com/api/v1)
  appURL: '__APP_URL__',        // Replace at deploy time (e.g., https://app.dbexec.com)
  appVersion: 'v26.1',
};
