export interface IAuditLog {
  name: string;
  version: number;
  action: string;
  update: string;
  modifiedOn: string;
  modifiedBy: string;
  oldData: string;
  newData: string;
  justification: any;
}

export interface ILogType {
  value: string;
  label: string;
  isClientEnabled: boolean;
}
