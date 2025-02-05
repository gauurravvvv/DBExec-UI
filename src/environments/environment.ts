import { IEnvironment } from 'src/app/common/interfaces/environment';

export const environment: IEnvironment = {
  production: false,
  defaultReportUrl: '##REPORTSERVER##',
  defaultBaseUrl: 'http://localhost:3000/api/v2',
  assetsUrl: 'http://localhost:4200',
};
