import { IEnvironment } from 'src/app/common/interfaces/environment';

export const environment: IEnvironment = {
  production: true,
  defaultBaseUrl: '##APISERVER##' + '/api/v2',
  defaultReportUrl: '##REPORTSERVER##',
  assetsUrl: '##ASSETSERVER##',
};
